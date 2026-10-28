# Local game server that disables browser caching, so Chrome always loads the latest game code.
import http.server, functools, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
http.server.ThreadingHTTPServer(("", port), functools.partial(NoCache, directory=root)).serve_forever()
