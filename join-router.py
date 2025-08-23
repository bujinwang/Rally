#!/usr/bin/env python3
"""
Simple HTTP server with URL routing for the Badminton Group join functionality.
Routes /join/XXXXXX URLs to /join.html?code=XXXXXX
"""

import http.server
import socketserver
import re
import os
from urllib.parse import urlparse, parse_qs

class JoinRouter(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Parse the URL
        parsed_url = urlparse(self.path)

        # Check if this is a join URL with a share code
        join_match = re.match(r'/join/([A-Z0-9]{6})', parsed_url.path, re.IGNORECASE)

        if join_match:
            # Extract the share code
            share_code = join_match.group(1).upper()

            # Redirect to the join.html with query parameter
            redirect_url = f'/join.html?code={share_code}'
            self.send_response(302)
            self.send_header('Location', redirect_url)
            self.end_headers()
            return

        # For all other requests, serve normally
        return super().do_GET()

    def do_HEAD(self):
        # Handle HEAD requests the same way as GET
        return self.do_GET()

if __name__ == '__main__':
    PORT = 3000

    with socketserver.TCPServer(("", PORT), JoinRouter) as httpd:
        print(f"Server running on port {PORT}")
        print("Join URLs like /join/XXXXXX will be redirected to /join.html?code=XXXXXX")
        httpd.serve_forever()