#!/usr/bin/env python3
import sys
import http.server
import socketserver
import os
import functools


class COOPHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8084
    directory = sys.argv[2] if len(sys.argv) > 2 else './dist'

    if not os.path.isdir(directory):
        print(f"Error: directory '{directory}' does not exist", file=sys.stderr)
        sys.exit(1)

    handler = functools.partial(COOPHandler, directory=directory)

    with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
        print(f"Serving {directory}/ on http://0.0.0.0:{port}/")
        print(f"  with COOP/COEP headers (for multi-threaded ffmpeg.wasm)")
        print(f"  Open http://127.0.0.1:{port}/ in your browser")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")
            httpd.shutdown()


if __name__ == "__main__":
    main()
