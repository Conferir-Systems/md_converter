"""Sidecar bridge: reads one JSON request from stdin, converts the document
with markitdown, writes one JSON response to stdout.

Protocol:
  request   {"input": "C:\\path\\file.pdf", "output": "C:\\out\\file.md"}
  success   {"ok": true, "output": "C:\\out\\file.md", "bytes": 12345}
  failure   {"ok": false, "error": "readable message", "code": "SOME_CODE"}

stdout carries exclusively the response JSON; everything else goes to stderr.
Exit code is 0 even on conversion failure; non-zero only when the bridge
itself cannot produce a response.
"""

import json
import os
import sys
import traceback

MAX_ERROR_LEN = 500


def truncate(message):
    message = ' '.join(str(message).split())
    if len(message) > MAX_ERROR_LEN:
        return message[:MAX_ERROR_LEN] + '…'
    return message


def run(request):
    input_path = request.get('input')
    output_path = request.get('output')
    if not isinstance(input_path, str) or not isinstance(output_path, str):
        return {'ok': False, 'error': 'Request must contain string fields "input" and "output"', 'code': 'INVALID_REQUEST'}

    if not os.path.isfile(input_path):
        return {'ok': False, 'error': f'Input file not found: {input_path}', 'code': 'INPUT_NOT_FOUND'}

    # Imported only after cheap validation: markitdown pulls in onnxruntime and
    # friends, which dominates startup time.
    from markitdown import (
        FileConversionException,
        MarkItDown,
        MissingDependencyException,
        UnsupportedFormatException,
    )

    try:
        result = MarkItDown().convert(input_path)
        markdown = result.markdown
    except MissingDependencyException as exc:
        return {'ok': False, 'error': truncate(exc), 'code': 'MISSING_DEPENDENCY'}
    except UnsupportedFormatException:
        extension = os.path.splitext(input_path)[1] or '(none)'
        return {'ok': False, 'error': f'No converter accepted this file (extension {extension})', 'code': 'UNSUPPORTED_FORMAT'}
    except FileConversionException as exc:
        traceback.print_exc(file=sys.stderr)
        return {'ok': False, 'error': truncate(exc), 'code': 'CONVERSION_FAILED'}
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        return {'ok': False, 'error': truncate(f'{type(exc).__name__}: {exc}'), 'code': 'CONVERSION_FAILED'}

    try:
        parent = os.path.dirname(output_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(markdown)
    except OSError as exc:
        return {'ok': False, 'error': truncate(f'Could not write output file: {exc}'), 'code': 'WRITE_FAILED'}

    return {'ok': True, 'output': output_path, 'bytes': len(markdown.encode('utf-8'))}


def main():
    # Reserve the real stdout for the response JSON; reroute every stray
    # print() from dependencies to stderr so it cannot corrupt the protocol.
    real_stdout = sys.stdout.buffer
    sys.stdout = sys.stderr

    try:
        raw = sys.stdin.buffer.read()
        request = json.loads(raw.decode('utf-8'))
        response = run(request)
    except json.JSONDecodeError as exc:
        response = {'ok': False, 'error': truncate(f'Request is not valid JSON: {exc}'), 'code': 'INVALID_REQUEST'}
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        response = {'ok': False, 'error': truncate(f'{type(exc).__name__}: {exc}'), 'code': 'BRIDGE_CRASH'}

    real_stdout.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
    real_stdout.flush()
    return 0


if __name__ == '__main__':
    sys.exit(main())
