"""Small, handle-relative filesystem adapter for the review artifact store.

The review-context helper uses POSIX ``dir_fd`` operations to keep an artifact
run anchored to a directory that it has already opened.  Python's Windows
``os`` module does not expose those operations, and a path based emulation
would re-introduce the replacement race that the artifact store is designed
to prevent.  This module provides only the handful of operations needed by
that helper and implements them with the Windows native file APIs.

The module intentionally has a narrow contract.  Relative names must be a
single safe leaf, directory descriptors must be CRT descriptors obtained from
this adapter, and all opens use ``FILE_OPEN_REPARSE_POINT``.  Reparse points
are therefore observed as links by ``stat(..., follow_symlinks=False)`` and
cannot be opened as regular artifact files.  Deletion is the one operation
that may act on a reparse point: it opens the link itself and deletes that
directory entry without ever traversing it, which lets cleanup remove an
unexpected link safely.

This file is imported only on Windows by ``review_context.py``.  Keeping the
non-Windows branch importable makes static checks and focused tests portable;
it deliberately does not provide a path-based fallback there.
"""

from __future__ import annotations

import ctypes
import errno
import ntpath
import os
import re
import stat as stat_module
from typing import Any, Iterator, NoReturn


# The values are intentionally outside the CRT open flag range.  The caller
# strips them before building a native create request.  They are not the
# values used by any of the Windows CRT constants.
DIRECTORY = 0x10000000
NOFOLLOW = 0x20000000

__all__ = [
    "DIRECTORY",
    "NOFOLLOW",
    "open",
    "stat",
    "link",
    "replace",
    "unlink",
    "rmdir",
    "scandir",
]

_IS_WINDOWS = os.name == "nt"
_ACCMODE = getattr(os, "O_ACCMODE", 3)

if _IS_WINDOWS:
    import msvcrt
    from ctypes import wintypes


    # NT object and create constants.  These are stable native API values;
    # only the values used by this adapter are declared here.
    _OBJ_CASE_INSENSITIVE = 0x00000040

    _FILE_READ_DATA = 0x00000001
    _FILE_LIST_DIRECTORY = 0x00000001
    _FILE_WRITE_DATA = 0x00000002
    _FILE_READ_ATTRIBUTES = 0x00000080
    _FILE_WRITE_ATTRIBUTES = 0x00000100
    _DELETE = 0x00010000
    _SYNCHRONIZE = 0x00100000

    _FILE_ATTRIBUTE_DIRECTORY = 0x00000010
    _FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400

    _FILE_SHARE_READ = 0x00000001
    _FILE_SHARE_WRITE = 0x00000002
    _FILE_SHARE_DELETE = 0x00000004

    _FILE_OPEN = 1
    _FILE_CREATE = 2
    _FILE_OPEN_IF = 3

    _FILE_DIRECTORY_FILE = 0x00000001
    _FILE_NON_DIRECTORY_FILE = 0x00000040
    _FILE_SYNCHRONOUS_IO_NONALERT = 0x00000020
    _FILE_OPEN_REPARSE_POINT = 0x00200000

    _FILE_DISPOSITION_INFORMATION = 13
    _FILE_END_OF_FILE_INFORMATION = 20
    _FILE_RENAME_INFORMATION = 10
    _FILE_LINK_INFORMATION = 11

    _FILE_ATTRIBUTE_TAG_INFORMATION = 9

    _INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


    class _UNICODE_STRING(ctypes.Structure):
        _fields_ = [
            ("Length", wintypes.USHORT),
            ("MaximumLength", wintypes.USHORT),
            ("Buffer", wintypes.LPWSTR),
        ]


    class _OBJECT_ATTRIBUTES(ctypes.Structure):
        _fields_ = [
            ("Length", wintypes.ULONG),
            ("RootDirectory", wintypes.HANDLE),
            ("ObjectName", ctypes.POINTER(_UNICODE_STRING)),
            ("Attributes", wintypes.ULONG),
            ("SecurityDescriptor", wintypes.LPVOID),
            ("SecurityQualityOfService", wintypes.LPVOID),
        ]


    class _IO_STATUS_BLOCK(ctypes.Structure):
        _fields_ = [
            ("Status", wintypes.LONG),
            ("Information", ctypes.c_size_t),
        ]


    class _FILE_ATTRIBUTE_TAG_INFO(ctypes.Structure):
        _fields_ = [
            ("FileAttributes", wintypes.DWORD),
            ("ReparseTag", wintypes.DWORD),
        ]


    class _FILE_NAME_INFORMATION_HEADER(ctypes.Structure):
        # FILE_RENAME_INFORMATION and FILE_LINK_INFORMATION share this
        # prefix.  The first ULONG is the BOOLEAN ReplaceIfExists union from
        # the legacy information classes.
        _fields_ = [
            ("ReplaceIfExists", wintypes.ULONG),
            ("RootDirectory", wintypes.HANDLE),
            ("FileNameLength", wintypes.ULONG),
        ]


    class _FILE_DISPOSITION_INFORMATION_STRUCT(ctypes.Structure):
        _fields_ = [("DeleteFile", wintypes.BOOLEAN)]


    class _FILE_END_OF_FILE_INFORMATION_STRUCT(ctypes.Structure):
        _fields_ = [("EndOfFile", ctypes.c_longlong)]


    _ntdll = ctypes.WinDLL("ntdll", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    _NtCreateFile = _ntdll.NtCreateFile
    _NtCreateFile.argtypes = [
        ctypes.POINTER(wintypes.HANDLE),
        wintypes.ULONG,
        ctypes.POINTER(_OBJECT_ATTRIBUTES),
        ctypes.POINTER(_IO_STATUS_BLOCK),
        ctypes.POINTER(ctypes.c_longlong),
        wintypes.ULONG,
        wintypes.ULONG,
        wintypes.ULONG,
        wintypes.ULONG,
        wintypes.LPVOID,
        wintypes.ULONG,
    ]
    _NtCreateFile.restype = wintypes.LONG

    _NtSetInformationFile = _ntdll.NtSetInformationFile
    _NtSetInformationFile.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(_IO_STATUS_BLOCK),
        wintypes.LPVOID,
        wintypes.ULONG,
        wintypes.ULONG,
    ]
    _NtSetInformationFile.restype = wintypes.LONG

    _NtQueryDirectoryFile = _ntdll.NtQueryDirectoryFile
    _NtQueryDirectoryFile.argtypes = [
        wintypes.HANDLE,
        wintypes.HANDLE,
        wintypes.LPVOID,
        wintypes.LPVOID,
        ctypes.POINTER(_IO_STATUS_BLOCK),
        wintypes.LPVOID,
        wintypes.ULONG,
        wintypes.ULONG,
        wintypes.BOOLEAN,
        wintypes.LPVOID,
        wintypes.BOOLEAN,
    ]
    _NtQueryDirectoryFile.restype = wintypes.LONG

    _RtlNtStatusToDosError = _ntdll.RtlNtStatusToDosError
    _RtlNtStatusToDosError.argtypes = [wintypes.LONG]
    _RtlNtStatusToDosError.restype = wintypes.ULONG

    _CloseHandle = _kernel32.CloseHandle
    _CloseHandle.argtypes = [wintypes.HANDLE]
    _CloseHandle.restype = wintypes.BOOL

    _SetHandleInformation = _kernel32.SetHandleInformation
    _SetHandleInformation.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD]
    _SetHandleInformation.restype = wintypes.BOOL

    _GetFileInformationByHandleEx = _kernel32.GetFileInformationByHandleEx
    _GetFileInformationByHandleEx.argtypes = [
        wintypes.HANDLE,
        wintypes.INT,
        wintypes.LPVOID,
        wintypes.DWORD,
    ]
    _GetFileInformationByHandleEx.restype = wintypes.BOOL

def _leaf(name: str | bytes | os.PathLike[str] | os.PathLike[bytes]) -> str:
    """Validate a dir_fd-relative artifact name."""

    value = os.fsdecode(os.fspath(name))
    # Artifact names generated by the helper are conservative ASCII names,
    # but cleanup must also be able to remove a user-created Unicode or
    # space-containing entry.  Reject every form that could be interpreted as
    # a path, stream, or DOS dot alias by the native filesystem parser.
    if (
        not value
        or value in {".", ".."}
        or "\x00" in value
        or "/" in value
        or "\\" in value
        or ":" in value
        or value[-1] in {".", " "}
    ):
        raise ValueError("artifact dir_fd operations require one safe leaf name")
    return value


def _unsupported() -> OSError:
    return OSError(errno.ENOTSUP, "Windows artifact filesystem backend is unavailable")


if not _IS_WINDOWS:

    # The adapter is intentionally not a portability layer.  A caller that
    # selects this module on another platform receives a clear failure rather
    # than silently falling back to path operations.
    def open(*args: Any, **kwargs: Any) -> int:
        raise _unsupported()


    def stat(*args: Any, **kwargs: Any) -> os.stat_result:
        raise _unsupported()


    def link(*args: Any, **kwargs: Any) -> None:
        raise _unsupported()


    def replace(*args: Any, **kwargs: Any) -> None:
        raise _unsupported()


    def unlink(*args: Any, **kwargs: Any) -> None:
        raise _unsupported()


    def rmdir(*args: Any, **kwargs: Any) -> None:
        raise _unsupported()


    def scandir(*args: Any, **kwargs: Any) -> Iterator[os.DirEntry[str]]:
        raise _unsupported()

else:

    def _raise_winerror(message: str, *, path: str | None = None, status: int | None = None) -> NoReturn:
        if status is not None:
            status_value = ctypes.c_ulong(status & 0xFFFFFFFF).value
            winerror = int(_RtlNtStatusToDosError(ctypes.c_long(status_value).value))
            if winerror == 0xFFFFFFFF:
                winerror = 31  # ERROR_GEN_FAILURE
        else:
            winerror = ctypes.get_last_error()
        raise OSError(winerror, message, path, winerror)


    def _native_handle_from_fd(fd: int) -> int:
        try:
            handle = int(msvcrt.get_osfhandle(fd))
        except (OSError, ValueError, TypeError) as error:
            raise OSError(errno.EBADF, "invalid artifact directory descriptor") from error
        if handle in (0, _INVALID_HANDLE_VALUE):
            raise OSError(errno.EBADF, "invalid artifact directory descriptor")
        return handle


    def _close_native(handle: int) -> None:
        if handle not in (0, _INVALID_HANDLE_VALUE):
            _CloseHandle(wintypes.HANDLE(handle))


    def _unicode_name(value: str) -> tuple[_UNICODE_STRING, ctypes.Array[Any]]:
        encoded_length = len(value.encode("utf-16-le"))
        if encoded_length > 0xFFFE:
            raise ValueError("artifact name is too long")
        buffer = ctypes.create_unicode_buffer(value)
        name = _UNICODE_STRING(
            Length=encoded_length,
            MaximumLength=encoded_length + 2,
            Buffer=ctypes.cast(buffer, wintypes.LPWSTR),
        )
        return name, buffer


    def _object_attributes(value: str, root_handle: int | None) -> tuple[_OBJECT_ATTRIBUTES, _UNICODE_STRING, ctypes.Array[Any]]:
        unicode_name, buffer = _unicode_name(value)
        attributes = _OBJECT_ATTRIBUTES(
            Length=ctypes.sizeof(_OBJECT_ATTRIBUTES),
            RootDirectory=wintypes.HANDLE(root_handle or 0),
            ObjectName=ctypes.pointer(unicode_name),
            Attributes=_OBJ_CASE_INSENSITIVE,
            SecurityDescriptor=None,
            SecurityQualityOfService=None,
        )
        return attributes, unicode_name, buffer


    def _native_error(status: int, message: str, path: str | None = None) -> NoReturn:
        _raise_winerror(message, path=path, status=status)


    def _query_attributes(handle: int) -> _FILE_ATTRIBUTE_TAG_INFO:
        info = _FILE_ATTRIBUTE_TAG_INFO()
        if not _GetFileInformationByHandleEx(
            wintypes.HANDLE(handle),
            _FILE_ATTRIBUTE_TAG_INFORMATION,
            ctypes.byref(info),
            ctypes.sizeof(info),
        ):
            _raise_winerror("cannot inspect artifact handle")
        return info


    def _is_reparse(info: _FILE_ATTRIBUTE_TAG_INFO) -> bool:
        return bool(info.FileAttributes & _FILE_ATTRIBUTE_REPARSE_POINT)


    def _validate_directory_handle(handle: int) -> _FILE_ATTRIBUTE_TAG_INFO:
        info = _query_attributes(handle)
        if _is_reparse(info):
            raise OSError(errno.ELOOP, "artifact directory is a reparse point")
        if not (info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY):
            raise NotADirectoryError(errno.ENOTDIR, "artifact descriptor is not a directory")
        return info


    def _native_create(
        name: str,
        *,
        root_handle: int | None,
        desired_access: int,
        create_disposition: int,
        create_options: int,
        path_for_error: str | None = None,
    ) -> tuple[int, int]:
        attributes, unicode_name, buffer = _object_attributes(name, root_handle)
        native_handle = wintypes.HANDLE()
        io_status = _IO_STATUS_BLOCK()
        allocation_size = ctypes.c_longlong(0)
        status = int(
            _NtCreateFile(
                ctypes.byref(native_handle),
                desired_access,
                ctypes.byref(attributes),
                ctypes.byref(io_status),
                ctypes.byref(allocation_size),
                0,
                _FILE_SHARE_READ | _FILE_SHARE_WRITE | _FILE_SHARE_DELETE,
                create_disposition,
                create_options,
                None,
                0,
            )
        )
        if status < 0:
            _native_error(status, "cannot open artifact path", path_for_error)
        return int(native_handle.value), int(io_status.Information)


    def _crt_flags(flags: int) -> int:
        access = flags & _ACCMODE
        value = access
        if hasattr(os, "O_BINARY"):
            value |= os.O_BINARY
        if hasattr(os, "O_NOINHERIT"):
            value |= os.O_NOINHERIT
        if flags & getattr(os, "O_APPEND", 0):
            value |= os.O_APPEND
        return value


    def _desired_access(flags: int) -> int:
        access = flags & _ACCMODE
        if access == os.O_RDONLY:
            return _FILE_READ_DATA | _FILE_READ_ATTRIBUTES | _SYNCHRONIZE
        if access == os.O_WRONLY:
            return _FILE_WRITE_DATA | _FILE_WRITE_ATTRIBUTES | _FILE_READ_ATTRIBUTES | _SYNCHRONIZE
        if access == os.O_RDWR:
            return (
                _FILE_READ_DATA
                | _FILE_WRITE_DATA
                | _FILE_WRITE_ATTRIBUTES
                | _FILE_READ_ATTRIBUTES
                | _SYNCHRONIZE
            )
        raise ValueError("invalid artifact access mode")


    def _disposition(flags: int) -> int:
        creating = bool(flags & os.O_CREAT)
        exclusive = bool(flags & os.O_EXCL)
        truncating = bool(flags & os.O_TRUNC)
        if exclusive and not creating:
            raise ValueError("O_EXCL requires O_CREAT")
        if truncating and (flags & _ACCMODE) == os.O_RDONLY:
            raise ValueError("O_TRUNC requires write access")
        if creating and exclusive:
            return _FILE_CREATE
        if creating:
            return _FILE_OPEN_IF
        # FILE_OVERWRITE can alter an existing reparse point before its
        # attributes are checked.  Open it first, reject reparse points, and
        # truncate the validated handle below instead.
        if truncating:
            return _FILE_OPEN
        return _FILE_OPEN


    def _relative_name(value: str) -> str:
        # ``_leaf`` also rejects separators and dot components.
        return _leaf(value)


    def _normalize_absolute(value: str) -> str:
        if not ntpath.isabs(value):
            raise ValueError("artifact path must be absolute when dir_fd is None")
        # Preserve extended paths while normalizing the ordinary DOS and UNC
        # forms accepted by pathlib on Windows.
        if value.startswith("\\\\?\\UNC\\"):
            value = "\\\\" + value[8:]
        elif value.startswith("\\\\?\\"):
            value = value[4:]
        elif value.startswith("\\\\.\\"):
            raise ValueError("device paths are not valid artifact roots")
        value = ntpath.normpath(value)
        if not ntpath.isabs(value):
            raise ValueError("artifact path must be absolute")
        return value


    def _absolute_parts(value: str) -> tuple[str, list[str]]:
        value = _normalize_absolute(value)
        drive, tail = ntpath.splitdrive(value)
        if drive.startswith("\\\\"):
            # ``splitdrive`` returns ``\\server\\share`` for a UNC path.
            share = drive[2:]
            root = "\\??\\UNC\\" + share + "\\"
        elif len(drive) == 2 and drive[1] == ":" and tail.startswith("\\"):
            root = "\\??\\" + drive + "\\"
        else:
            raise ValueError("unsupported artifact root path")
        parts = [part for part in tail.strip("\\").split("\\") if part]
        if any(
            part in {".", ".."}
            or "\x00" in part
            or ":" in part
            or "*" in part
            or "?" in part
            for part in parts
        ):
            raise ValueError("artifact path contains an unsafe component")
        return root, parts


    def _open_native_relative(
        name: str,
        *,
        root_handle: int,
        flags: int,
        mode: int = 0o666,
        allow_reparse: bool = False,
        path_for_error: str | None = None,
        type_constraint: bool = True,
        desired_access: int | None = None,
    ) -> int:
        del mode  # Windows security descriptors control the effective mode.
        relative = _relative_name(name)
        directory = bool(flags & DIRECTORY)
        options = _FILE_OPEN_REPARSE_POINT | _FILE_SYNCHRONOUS_IO_NONALERT
        if type_constraint:
            options |= _FILE_DIRECTORY_FILE if directory else _FILE_NON_DIRECTORY_FILE
        native_handle, _ = _native_create(
            relative,
            root_handle=root_handle,
            desired_access=desired_access if desired_access is not None else _desired_access(flags),
            create_disposition=_disposition(flags),
            create_options=options,
            path_for_error=path_for_error or relative,
        )
        try:
            info = _query_attributes(native_handle)
            if _is_reparse(info) and not allow_reparse:
                _close_native(native_handle)
                native_handle = 0
                raise OSError(errno.ELOOP, "artifact path is a reparse point", path_for_error or relative)
            if type_constraint and directory and not (info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY):
                _close_native(native_handle)
                native_handle = 0
                raise NotADirectoryError(errno.ENOTDIR, "artifact path is not a directory", path_for_error or relative)
            if type_constraint and not directory and (info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY):
                _close_native(native_handle)
                native_handle = 0
                raise IsADirectoryError(errno.EISDIR, "artifact path is a directory", path_for_error or relative)
            if flags & getattr(os, "O_TRUNC", 0):
                # This call is reached only after the no-follow validation
                # above.  The end-of-file update is performed by handle and
                # therefore cannot target a replaced path entry.
                _truncate_native(native_handle)
            return native_handle
        except Exception:
            # All branches that rejected the handle above close it.  The
            # exception path here is for metadata query failures only.
            if native_handle not in (0, _INVALID_HANDLE_VALUE):
                # Metadata failures are rare but must not leak a native
                # handle.  Rejection branches clear the local value first.
                _close_native(native_handle)
            raise


    def _open_native_absolute(
        value: str,
        *,
        flags: int,
        mode: int,
        allow_reparse: bool = False,
        type_constraint: bool = True,
        desired_access: int | None = None,
    ) -> int:
        root_path, parts = _absolute_parts(value)
        # Open the volume/share root first, then descend one component at a
        # time.  Every component is opened with FILE_OPEN_REPARSE_POINT and
        # validated before it becomes the RootDirectory for the next one.
        root_handle, _ = _native_create(
            root_path,
            root_handle=None,
            desired_access=_FILE_LIST_DIRECTORY | _FILE_READ_ATTRIBUTES | _SYNCHRONIZE,
            create_disposition=_FILE_OPEN,
            create_options=_FILE_DIRECTORY_FILE | _FILE_OPEN_REPARSE_POINT | _FILE_SYNCHRONOUS_IO_NONALERT,
            path_for_error=value,
        )
        current = root_handle
        try:
            info = _query_attributes(current)
            if _is_reparse(info):
                _close_native(current)
                current = 0
                raise OSError(errno.ELOOP, "artifact root is a reparse point", value)
            if not (info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY):
                _close_native(current)
                current = 0
                raise NotADirectoryError(errno.ENOTDIR, "artifact root is not a directory", value)
            if not parts:
                if type_constraint and not (flags & DIRECTORY):
                    _close_native(current)
                    current = 0
                    raise IsADirectoryError(errno.EISDIR, "artifact path is a directory", value)
                return current

            for index, part in enumerate(parts):
                final = index == len(parts) - 1
                next_flags = flags if final else DIRECTORY
                child = _open_native_relative(
                    part,
                    root_handle=current,
                    flags=next_flags,
                    mode=mode,
                    allow_reparse=allow_reparse,
                    path_for_error=value,
                    type_constraint=type_constraint if final else True,
                    desired_access=desired_access if final else None,
                )
                _close_native(current)
                current = 0
                current = child
            return current
        except Exception:
            # If a child open failed, current still names the last handle we
            # own.  Walk back only this local chain; no filesystem mutation is
            # attempted.
            try:
                _close_native(current)
            except Exception:
                pass
            raise


    def _open_native_for_fd(
        name: str,
        *,
        dir_fd: int | None,
        flags: int,
        mode: int = 0o666,
        allow_reparse: bool = False,
        type_constraint: bool = True,
        desired_access: int | None = None,
    ) -> int:
        if dir_fd is None:
            value = os.fsdecode(os.fspath(name))
            if not ntpath.isabs(value):
                raise ValueError("artifact path must be absolute when dir_fd is None")
            return _open_native_absolute(
                value,
                flags=flags,
                mode=mode,
                allow_reparse=allow_reparse,
                type_constraint=type_constraint,
                desired_access=desired_access,
            )
        root_handle = _native_handle_from_fd(dir_fd)
        _validate_directory_handle(root_handle)
        return _open_native_relative(
            name,
            root_handle=root_handle,
            flags=flags,
            mode=mode,
            allow_reparse=allow_reparse,
            type_constraint=type_constraint,
            desired_access=desired_access,
        )


    def _to_crt_fd(native_handle: int, flags: int) -> int:
        if not _SetHandleInformation(native_handle, 0x00000001, 0):
            error = ctypes.get_last_error()
            _close_native(native_handle)
            raise OSError(error, "cannot secure artifact handle inheritance", None, error)
        try:
            fd = int(msvcrt.open_osfhandle(native_handle, _crt_flags(flags)))
        except (OSError, ValueError) as error:
            _close_native(native_handle)
            raise OSError(errno.EMFILE, "cannot allocate artifact CRT descriptor") from error
        return fd


    def _fstat_handle(native_handle: int, fd: int, *, reparse_info: _FILE_ATTRIBUTE_TAG_INFO | None = None) -> os.stat_result:
        value = os.fstat(fd)
        info = reparse_info or _query_attributes(native_handle)
        if not _is_reparse(info):
            return value
        # Windows CRT fstat classifies a handle to a reparse point according
        # to the target in some versions.  Make the no-follow contract
        # explicit so stat.S_ISREG cannot accidentally accept it.
        mode = stat_module.S_IFLNK | (value.st_mode & 0o777)
        return os.stat_result((mode, *tuple(value)[1:]))


    def open(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        flags: int,
        mode: int = 0o666,
        *,
        dir_fd: int | None = None,
    ) -> int:
        """Open a trusted artifact path and return a CRT descriptor."""

        native_handle = _open_native_for_fd(
            path,
            dir_fd=dir_fd,
            flags=flags,
            mode=mode,
            allow_reparse=False,
        )
        return _to_crt_fd(native_handle, flags)


    def stat(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        *,
        dir_fd: int | None = None,
        follow_symlinks: bool = False,
    ) -> os.stat_result:
        """Return no-follow metadata for a path relative to a directory fd."""

        if follow_symlinks:
            raise ValueError("Windows artifact stat only supports follow_symlinks=False")
        native_handle = _open_native_for_fd(
            path,
            dir_fd=dir_fd,
            flags=os.O_RDONLY,
            allow_reparse=True,
            type_constraint=False,
            desired_access=_FILE_READ_ATTRIBUTES | _SYNCHRONIZE,
        )
        fd: int | None = None
        try:
            fd = _to_crt_fd(native_handle, os.O_RDONLY)
            native_handle = _native_handle_from_fd(fd)
            return _fstat_handle(native_handle, fd)
        finally:
            if fd is not None:
                os.close(fd)


    def _open_mutation_target(
        name: str,
        *,
        dir_fd: int,
        expect_directory: bool | None = None,
    ) -> tuple[int, int, _FILE_ATTRIBUTE_TAG_INFO]:
        root_handle = _native_handle_from_fd(dir_fd)
        _validate_directory_handle(root_handle)
        flags = os.O_RDONLY
        native_handle = _open_native_relative(
            name,
            root_handle=root_handle,
            flags=flags,
            allow_reparse=True,
            type_constraint=False,
            desired_access=_DELETE | _FILE_READ_ATTRIBUTES | _SYNCHRONIZE,
        )
        info = _query_attributes(native_handle)
        is_directory = bool(info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY)
        if expect_directory is True and not is_directory:
            _close_native(native_handle)
            raise NotADirectoryError(errno.ENOTDIR, "artifact target is not a directory", name)
        if expect_directory is False and is_directory:
            _close_native(native_handle)
            raise IsADirectoryError(errno.EISDIR, "artifact target is a directory", name)
        return native_handle, root_handle, info


    def _name_information(name: str, *, root_handle: int, replace_if_exists: bool) -> ctypes.Array[ctypes.c_char]:
        encoded = name.encode("utf-16-le")
        prefix = _FILE_NAME_INFORMATION_HEADER()
        prefix.ReplaceIfExists = 1 if replace_if_exists else 0
        prefix.RootDirectory = wintypes.HANDLE(root_handle)
        prefix.FileNameLength = len(encoded)
        # The flexible WCHAR[1] member starts immediately after FileNameLength
        # (offset 20 on x64, 12 on x86).  ``sizeof`` includes alignment
        # padding, so derive the actual offset from the field layout.
        filename_offset = _FILE_NAME_INFORMATION_HEADER.FileNameLength.offset + ctypes.sizeof(wintypes.ULONG)
        raw = (ctypes.c_char * (filename_offset + len(encoded)))()
        ctypes.memmove(raw, ctypes.byref(prefix), filename_offset)
        ctypes.memmove(ctypes.addressof(raw) + filename_offset, encoded, len(encoded))
        return raw


    def _set_information(native_handle: int, information_class: int, data: Any) -> None:
        io_status = _IO_STATUS_BLOCK()
        if isinstance(data, ctypes.Structure):
            pointer = ctypes.cast(ctypes.byref(data), wintypes.LPVOID)
            data_size = ctypes.sizeof(data)
        else:
            pointer = ctypes.cast(data, wintypes.LPVOID)
            data_size = ctypes.sizeof(data)
        status = int(
            _NtSetInformationFile(
                wintypes.HANDLE(native_handle),
                ctypes.byref(io_status),
                pointer,
                data_size,
                information_class,
            )
        )
        if status < 0:
            _native_error(status, "cannot update artifact entry")


    def _truncate_native(native_handle: int) -> None:
        data = _FILE_END_OF_FILE_INFORMATION_STRUCT(EndOfFile=0)
        _set_information(native_handle, _FILE_END_OF_FILE_INFORMATION, data)


    def link(
        src: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        dst: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        *,
        src_dir_fd: int | None = None,
        dst_dir_fd: int | None = None,
        follow_symlinks: bool = False,
    ) -> None:
        if follow_symlinks:
            raise ValueError("Windows artifact link only supports follow_symlinks=False")
        if src_dir_fd is None or dst_dir_fd is None:
            raise ValueError("artifact hardlinks require source and destination dir_fd")
        source_name = _relative_name(src)
        destination_name = _relative_name(dst)
        source_root = _native_handle_from_fd(src_dir_fd)
        destination_root = _native_handle_from_fd(dst_dir_fd)
        _validate_directory_handle(source_root)
        _validate_directory_handle(destination_root)
        native_source = _open_native_relative(
            source_name,
            root_handle=source_root,
            flags=os.O_RDONLY,
            allow_reparse=False,
        )
        try:
            info = _query_attributes(native_source)
            if info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY:
                raise IsADirectoryError(errno.EISDIR, "cannot hardlink an artifact directory", source_name)
            data = _name_information(destination_name, root_handle=destination_root, replace_if_exists=False)
            _set_information(native_source, _FILE_LINK_INFORMATION, data)
        finally:
            _close_native(native_source)


    def replace(
        src: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        dst: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        *,
        src_dir_fd: int | None = None,
        dst_dir_fd: int | None = None,
    ) -> None:
        if src_dir_fd is None or dst_dir_fd is None:
            raise ValueError("artifact replacement requires source and destination dir_fd")
        source_name = _relative_name(src)
        destination_name = _relative_name(dst)
        source_root = _native_handle_from_fd(src_dir_fd)
        destination_root = _native_handle_from_fd(dst_dir_fd)
        _validate_directory_handle(source_root)
        _validate_directory_handle(destination_root)
        # Replacing a destination reparse point would still be handle
        # relative, but accepting one here would make the adapter's regular
        # artifact contract inconsistent with its stat/open operations.  Open
        # the destination itself (without following it), reject links and
        # directories, and leave the final rename to the native atomic call.
        try:
            native_destination = _open_native_relative(
                destination_name,
                root_handle=destination_root,
                flags=os.O_RDONLY,
                allow_reparse=True,
                type_constraint=False,
                desired_access=_FILE_READ_ATTRIBUTES | _SYNCHRONIZE,
            )
        except FileNotFoundError:
            native_destination = None
        if native_destination is not None:
            try:
                destination_info = _query_attributes(native_destination)
                if _is_reparse(destination_info):
                    raise OSError(errno.ELOOP, "artifact destination is a reparse point", destination_name)
                if destination_info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY:
                    raise IsADirectoryError(errno.EISDIR, "artifact destination is a directory", destination_name)
            finally:
                _close_native(native_destination)
        native_source = _open_native_relative(
            source_name,
            root_handle=source_root,
            flags=os.O_RDONLY,
            allow_reparse=False,
            desired_access=_DELETE | _FILE_READ_ATTRIBUTES | _FILE_WRITE_ATTRIBUTES | _SYNCHRONIZE,
        )
        try:
            info = _query_attributes(native_source)
            if info.FileAttributes & _FILE_ATTRIBUTE_DIRECTORY:
                raise IsADirectoryError(errno.EISDIR, "cannot replace with an artifact directory", source_name)
            data = _name_information(destination_name, root_handle=destination_root, replace_if_exists=True)
            _set_information(native_source, _FILE_RENAME_INFORMATION, data)
        finally:
            _close_native(native_source)


    def _delete(name: str | bytes | os.PathLike[str] | os.PathLike[bytes], dir_fd: int, *, directory: bool) -> None:
        native_target, _, info = _open_mutation_target(
            _relative_name(name),
            dir_fd=dir_fd,
            expect_directory=True if directory else None,
        )
        del info
        try:
            data = _FILE_DISPOSITION_INFORMATION_STRUCT(DeleteFile=True)
            _set_information(native_target, _FILE_DISPOSITION_INFORMATION, data)
        finally:
            _close_native(native_target)


    def unlink(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        *,
        dir_fd: int | None = None,
    ) -> None:
        if dir_fd is None:
            raise ValueError("artifact unlink requires dir_fd")
        _delete(path, dir_fd, directory=False)


    def rmdir(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        *,
        dir_fd: int | None = None,
    ) -> None:
        if dir_fd is None:
            raise ValueError("artifact rmdir requires dir_fd")
        _delete(path, dir_fd, directory=True)


    _STATUS_NO_MORE_FILES = 0x80000006
    _STATUS_BUFFER_OVERFLOW = 0x80000005
    _FILE_NAMES_INFORMATION = 12


    class _HandleDirEntry:
        """Minimal DirEntry-compatible view backed by the directory handle."""

        __slots__ = ("name",)

        def __init__(self, name: str) -> None:
            self.name = name


    class _HandleScandir:
        """Iterator for ``NtQueryDirectoryFile(FileNamesInformation)``."""

        def __init__(self, directory_fd: int) -> None:
            self._directory_fd = directory_fd
            self._handle = _native_handle_from_fd(directory_fd)
            _validate_directory_handle(self._handle)
            self._buffer_size = 64 * 1024
            self._buffer = ctypes.create_string_buffer(self._buffer_size)
            self._restart = True
            self._done = False
            self._pending: list[str] = []

        def __enter__(self) -> "_HandleScandir":
            return self

        def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> None:
            self.close()

        def close(self) -> None:
            self._done = True
            self._pending.clear()

        def __iter__(self) -> "_HandleScandir":
            return self

        def __next__(self) -> _HandleDirEntry:
            while not self._pending and not self._done:
                self._fill()
            if not self._pending:
                raise StopIteration
            return _HandleDirEntry(self._pending.pop(0))

        def _fill(self) -> None:
            io_status = _IO_STATUS_BLOCK()
            status = int(
                _NtQueryDirectoryFile(
                    wintypes.HANDLE(self._handle),
                    wintypes.HANDLE(0),
                    None,
                    None,
                    ctypes.byref(io_status),
                    ctypes.byref(self._buffer),
                    self._buffer_size,
                    _FILE_NAMES_INFORMATION,
                    False,
                    None,
                    self._restart,
                )
            )
            self._restart = False
            unsigned_status = status & 0xFFFFFFFF
            if unsigned_status == _STATUS_NO_MORE_FILES:
                self._done = True
                return
            if status < 0 and unsigned_status != _STATUS_BUFFER_OVERFLOW:
                _native_error(status, "cannot enumerate artifact directory")

            returned = int(io_status.Information)
            if returned <= 0 or returned > self._buffer_size:
                if unsigned_status == _STATUS_BUFFER_OVERFLOW:
                    _native_error(status, "artifact directory entry is too large")
                self._done = True
                return

            raw = self._buffer.raw
            offset = 0
            names: list[str] = []
            while offset + 12 <= returned:
                next_offset = int.from_bytes(raw[offset : offset + 4], "little")
                name_length = int.from_bytes(raw[offset + 8 : offset + 12], "little")
                name_start = offset + 12
                name_end = name_start + name_length
                if name_length % 2 or name_end > returned:
                    _native_error(0xC000000D, "invalid artifact directory entry")
                name = raw[name_start:name_end].decode("utf-16-le")
                if name not in {".", ".."}:
                    names.append(name)
                if next_offset == 0:
                    break
                if next_offset < 12 or offset + next_offset > returned:
                    _native_error(0xC000000D, "invalid artifact directory entry offset")
                offset += next_offset
            self._pending.extend(names)
            if not names and unsigned_status != _STATUS_BUFFER_OVERFLOW:
                self._done = True


    def scandir(directory_fd: int) -> _HandleScandir:
        """Enumerate names directly from a validated directory handle."""

        return _HandleScandir(directory_fd)
