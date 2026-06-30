#!/usr/bin/env python3
"""
Static file server with COOP/COEP headers for multi-threaded ffmpeg.wasm.

Multi-threaded ffmpeg.wasm requires SharedArrayBuffer, which is only
available in a cross-origin isolated context. This server sets the two
required headers:
  - Cross-Origin-Opener-Policy: same-origin
  - Cross-Origin-Embedder-Policy: require-corp

Usage: python3 serve_with_coop.py [port] [directory]
Defaults: port 8084, directory = ./dist
"""
import sys
import http.server
import socketserver
import os
import functools


class COOPHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that adds COOP/COEP headers to every response."""

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
