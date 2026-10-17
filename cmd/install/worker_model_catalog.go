package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type opencodeCatalogLimits struct {
	Timeout     time.Duration
	WaitDelay   time.Duration
	StdoutBytes int
	StderrBytes int
	Records     int
	RecordBytes int
}

type opencodeCatalogModel struct {
	Provider  string
	ID        string
	Reasoning bool
}

func defaultOpencodeCatalogLimits() opencodeCatalogLimits {
	return opencodeCatalogLimits{
		Timeout: 5 * time.Second, WaitDelay: 250 * time.Millisecond,
		StdoutBytes: 16 << 20, StderrBytes: 8 << 10,
		Records: 8192, RecordBytes: 256 << 10,
	}
}

func parseOpencodeModelCatalog(output []byte, limits opencodeCatalogLimits, categories workerModelCategories) ([]opencodeCatalogModel, error) {
	if len(output) > limits.StdoutBytes {
		return nil, workerModelInvalid("catalog_output_limit")
	}
	models := []opencodeCatalogModel{}
	seen := map[string]bool{}
	remaining := bytes.TrimLeft(output, "\r\n")
	if len(bytes.TrimSpace(remaining)) == 0 {
		return models, nil
	}
	for len(remaining) > 0 {
		newline := bytes.IndexByte(remaining, '\n')
		if newline < 0 {
			return nil, workerModelInvalid("catalog_invalid")
		}
		header := strings.TrimSuffix(string(remaining[:newline]), "\r")
		provider, model, found := strings.Cut(header, "/")
		if !found {
			return nil, workerModelInvalid("catalog_invalid")
		}
		if _, err := workerModelIdentity(provider, "provider", categories); err != nil {
			return nil, workerModelInvalid("catalog_invalid")
		}
		if _, err := workerModelIdentity(model, "model", categories); err != nil {
			return nil, workerModelInvalid("catalog_invalid")
		}
		body := bytes.TrimLeft(remaining[newline+1:], " \t\r\n")
		if len(body) == 0 || body[0] != '{' {
			return nil, workerModelInvalid("catalog_invalid")
		}
		decoder := json.NewDecoder(io.LimitReader(bytes.NewReader(body), int64(limits.RecordBytes)+1))
		var metadata map[string]json.RawMessage
		if err := decoder.Decode(&metadata); err != nil {
			if errors.Is(err, io.ErrUnexpectedEOF) && len(body) > limits.RecordBytes {
				return nil, workerModelInvalid("catalog_record_size_limit")
			}
			return nil, workerModelInvalid("catalog_invalid")
		}
		end := decoder.InputOffset()
		if end > int64(limits.RecordBytes) {
			return nil, workerModelInvalid("catalog_record_size_limit")
		}
		var id string
		if !validWorkerModelJSONUnicode(metadata["id"]) || json.Unmarshal(metadata["id"], &id) != nil || id != model {
			return nil, workerModelInvalid("catalog_invalid")
		}
		// The native header identifies the provider; older metadata may omit it.
		if value, present := metadata["providerID"]; present {
			var id string
			if !validWorkerModelJSONUnicode(value) || json.Unmarshal(value, &id) != nil || id != provider {
				return nil, workerModelInvalid("catalog_invalid")
			}
		}
		entry := opencodeCatalogModel{Provider: provider, ID: model}
		if value, present := metadata["capabilities"]; present {
			var capabilities map[string]json.RawMessage
			if json.Unmarshal(value, &capabilities) != nil || capabilities == nil {
				return nil, workerModelInvalid("catalog_invalid")
			}
			if reasoning, present := capabilities["reasoning"]; present {
				if string(reasoning) != "true" && string(reasoning) != "false" {
					return nil, workerModelInvalid("catalog_invalid")
				}
				entry.Reasoning = string(reasoning) == "true"
			}
		}
		key := provider + "\x00" + model
		if seen[key] {
			return nil, workerModelInvalid("catalog_invalid")
		}
		seen[key] = true
		models = append(models, entry)
		if len(models) > limits.Records {
			return nil, workerModelInvalid("catalog_record_limit")
		}
		remaining = bytes.TrimLeft(body[end:], " \t\r")
		if len(remaining) != 0 && remaining[0] != '\n' {
			return nil, workerModelInvalid("catalog_invalid")
		}
		remaining = bytes.TrimLeft(remaining, " \t\r\n")
	}
	return models, nil
}

type opencodeCatalogBuffer struct {
	data     bytes.Buffer
	limit    int
	exceeded bool
	cancel   context.CancelFunc
}

func (buffer *opencodeCatalogBuffer) Write(data []byte) (int, error) {
	if len(data) > buffer.limit-buffer.data.Len() {
		accepted := buffer.limit - buffer.data.Len()
		_, _ = buffer.data.Write(data[:accepted])
		buffer.exceeded = true
		buffer.cancel()
		return accepted, workerModelInvalid("catalog_output_limit")
	}
	return buffer.data.Write(data)
}

func resolveOpencodeModelCLI(selected string) (string, error) {
	executable := selected
	if executable == "" {
		var err error
		executable, err = exec.LookPath("opencode")
		if err != nil {
			return "", workerModelInvalid("catalog_launcher_unavailable")
		}
		executable, err = filepath.Abs(executable)
		if err != nil {
			return "", workerModelInvalid("catalog_launcher_unavailable")
		}
	}
	if !filepath.IsAbs(executable) {
		return "", workerModelInvalid("catalog_launcher_unavailable")
	}
	info, err := os.Stat(executable)
	if err != nil || !info.Mode().IsRegular() {
		return "", workerModelInvalid("catalog_launcher_unavailable")
	}
	return executable, nil
}

func probeOpencodeModelCatalog(parent context.Context, selected, configRoot string, limits opencodeCatalogLimits, categories workerModelCategories) ([]opencodeCatalogModel, error) {
	executable, err := resolveOpencodeModelCLI(selected)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(parent, limits.Timeout)
	defer cancel()
	stdout := &opencodeCatalogBuffer{limit: limits.StdoutBytes, cancel: cancel}
	stderr := &opencodeCatalogBuffer{limit: limits.StderrBytes, cancel: cancel}
	command := exec.CommandContext(ctx, executable, "models", "--verbose")
	command.Env = append(os.Environ(), "OPENCODE_CONFIG_DIR="+configRoot)
	command.WaitDelay = limits.WaitDelay
	command.Stdout, command.Stderr = stdout, stderr
	err = command.Run()
	if stdout.exceeded {
		return nil, workerModelInvalid("catalog_output_limit")
	}
	if stderr.exceeded {
		return nil, workerModelInvalid("catalog_diagnostics_limit")
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return nil, workerModelInvalid("catalog_timeout")
	}
	if ctx.Err() != nil {
		return nil, workerModelInvalid("catalog_cancelled")
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) || errors.Is(err, exec.ErrWaitDelay) {
			return nil, workerModelInvalid("catalog_unavailable")
		}
		return nil, workerModelInvalid("catalog_launcher_unavailable")
	}
	return parseOpencodeModelCatalog(stdout.data.Bytes(), limits, categories)
}
