#!/usr/bin/env python3
"""
Einfacher HTTP Server für Height Tiles
Für lokale Entwicklung

Liefert Binary Height Tiles mit CORS Support
"""

import http.server
import socketserver
import gzip
from pathlib import Path


class TileHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Handler mit CORS und GZIP Support"""

    def end_headers(self):
        # CORS Headers für lokale Entwicklung
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_GET(self):
        """Handle GET requests"""
        # Tile-Request? (z.B. /tiles/tile_460_5740.bin.gz)
        if self.path.startswith('/tiles/') and self.path.endswith('.bin.gz'):
            # Datei laden
            file_path = Path('.') / self.path[1:]  # Remove leading /

            if file_path.exists():
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Encoding', 'gzip')
                self.end_headers()

                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())

                print(f"✅ Served: {self.path}")
            else:
                self.send_error(404, f"Tile not found: {file_path}")
                print(f"❌ Not found: {file_path}")
        else:
            # Standard file serving
            super().do_GET()

    def do_OPTIONS(self):
        """Handle preflight OPTIONS requests"""
        self.send_response(200)
        self.end_headers()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Height Tile Server")
    parser.add_argument("-p", "--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("-d", "--directory", default=".", help="Base directory (default: current)")

    args = parser.parse_args()

    # Wechsel ins Verzeichnis
    import os
    os.chdir(args.directory)

    PORT = args.port

    with socketserver.TCPServer(("", PORT), TileHandler) as httpd:
        print(f"🚀 Height Tile Server läuft auf:")
        print(f"   http://localhost:{PORT}")
        print(f"\n📂 Serving from: {Path.cwd()}")
        print(f"\n🔗 Test-URL:")
        print(f"   http://localhost:{PORT}/tiles/tile_460_5740.bin.gz")
        print(f"\n⏹  Stoppen mit Ctrl+C\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 Server gestoppt")
