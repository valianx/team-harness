"""Close stdout while the child keeps reading commands from stdin."""

import json
import os
import sys


def write_all(data):
    remaining = memoryview(data)
    while remaining:
        written = os.write(1, remaining)
        if not written:
            raise OSError("stdout write made no progress")
        remaining = remaining[written:]


for line in sys.stdin.buffer:
    command = json.loads(line)
    if command["type"] == "get_state":
        response = {
            "id": command["id"], "type": "response", "command": "get_state", "success": True,
            "data": {"sessionId": "eof-fixture", "sessionFile": os.path.join(os.getcwd(), "eof-session.jsonl"),
                     "isStreaming": False, "isCompacting": False},
        }
        write_all((json.dumps(response) + "\n").encode("utf-8"))
    elif command["type"] == "eof":
        if command["truncated"]:
            write_all(b'{"type":')
        # No duplicated writer or buffered stdout data: close the inherited pipe fd itself.
        os.close(1)
    elif command["type"] != "stall":
        raise ValueError("fixture command refused")
