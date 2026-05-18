import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

PORT = 8765

_signals: queue.Queue = queue.Queue()
_commands: queue.Queue = queue.Queue()


class _ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class _Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._send(204, {})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        try:
            data = json.loads(self.rfile.read(length))
            _signals.put(data)
            self._send(200, {'ok': True})
        except Exception as e:
            self._send(400, {'error': str(e)})

    def do_GET(self):
        if self.path != '/command':
            self._send(404, {})
            return
        try:
            cmd = _commands.get(timeout=0.4)
            self._send(200, cmd)
        except queue.Empty:
            self._send(200, {'action': 'idle'})

    def _send(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def start():
    server = _ThreadedHTTPServer(('127.0.0.1', PORT), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f'[watcher] HTTP en 127.0.0.1:{PORT}')


def send_command(cmd: dict):
    _commands.put(cmd)


def drain():
    while not _signals.empty():
        try:
            _signals.get_nowait()
        except queue.Empty:
            break


def wait(expected_types: list[str], timeout: float, stop_event=None) -> dict | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if stop_event is not None and stop_event.is_set():
            return None
        try:
            signal = _signals.get(timeout=0.3)
            sig_type = signal.get('type', '')
            if sig_type in expected_types:
                return signal
            print(f'[watcher] Señal ignorada: {sig_type}')
        except queue.Empty:
            pass
    return None
