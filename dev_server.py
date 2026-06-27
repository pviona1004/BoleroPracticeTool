from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys


class LocalServer(ThreadingHTTPServer):
    def server_bind(self):
        super().server_bind()
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    handler = partial(SimpleHTTPRequestHandler, directory=".")
    server = LocalServer(("127.0.0.1", port), handler)
    print(f"Serving on http://localhost:{port}/", flush=True)
    server.serve_forever()
