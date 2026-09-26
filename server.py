#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LOOTCHECK.GG - Serveur REEL avec vraie connexion Epic Games OAuth2
- Sert le site statique (index.html, style.css, app.js)
- /auth/login    -> redirige vers https://www.epicgames.com/id/authorize
- /auth/callback -> échange le ?code= contre access_token (côté serveur, secret jamais exposé)
- /api/me        -> retourne le vrai profil Epic (displayName, accountId)
- /api/logout    -> déconnexion
- /api/config    -> dit si EPIC_CLIENT_ID est configuré

Docs officielles:
- authorize: https://www.epicgames.com/id/authorize?client_id=...&response_type=code&scope=basic_profile&redirect_uri=...
- token: POST https://api.epicgames.dev/epic/oauth/v2/token (Basic client_id:secret, grant_type=authorization_code)
- userinfo: GET https://api.epicgames.dev/epic/oauth/v2/userInfo (Bearer token)

Lancement:  python server.py  (puis http://localhost:8000)
Config: remplis epic_config.json (voir epic_config.EXEMPLE.json)
"""
import json
import os
import base64
import secrets
import urllib.parse
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8000"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "epic_config.json")

EPIC_AUTHORIZE = "https://www.epicgames.com/id/authorize"
EPIC_TOKEN = "https://api.epicgames.dev/epic/oauth/v2/token"
EPIC_USERINFO = "https://api.epicgames.dev/epic/oauth/v2/userInfo"

# sessions en mémoire: {session_id: {...}} -> multi-utilisateurs (1 session par login, cookie HttpOnly)
SESSIONS = {}

def load_config():
    # Priorité aux variables d'environnement (prod Render/Railway) puis epic_config.json (local)
    cfg = {
        "EPIC_CLIENT_ID": os.environ.get("EPIC_CLIENT_ID", ""),
        "EPIC_CLIENT_SECRET": os.environ.get("EPIC_CLIENT_SECRET", ""),
        "REDIRECT_URI": os.environ.get("REDIRECT_URI", ""),
        "SCOPE": os.environ.get("EPIC_SCOPE", "basic_profile"),
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                file_cfg = json.load(f)
            for k in ("EPIC_CLIENT_ID", "EPIC_CLIENT_SECRET", "REDIRECT_URI", "SCOPE"):
                if not cfg[k] and file_cfg.get(k):
                    cfg[k] = file_cfg[k]
        except Exception:
            pass
    if not cfg["REDIRECT_URI"]:
        cfg["REDIRECT_URI"] = f"http://localhost:{PORT}/auth/callback"
    return cfg

def save_session(data):
    sid = secrets.token_hex(16)
    SESSIONS[sid] = data
    return sid

def get_session(handler):
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("lootcheck_sid="):
            sid = part.split("=", 1)[1]
            return sid, SESSIONS.get(sid)
    return None, None

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, *args):
        print("[LOOTCHECK]", *args)

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/config":
            cfg = load_config()
            cid = (cfg.get("EPIC_CLIENT_ID") or "").strip()
            csec = (cfg.get("EPIC_CLIENT_SECRET") or "").strip()
            is_reel = bool(cid and csec and not cid.startswith("TON_") and not csec.startswith("TON_"))
            return self.send_json({
                "reel": is_reel,
                "redirect_uri": cfg.get("REDIRECT_URI", f"http://localhost:{PORT}/auth/callback"),
            })

        if path == "/api/me":
            sid, sess = get_session(self)
            if sess:
                return self.send_json({"connected": True, "reel": True, **{k: v for k, v in sess.items() if k != "access_token"}})
            return self.send_json({"connected": False, "reel": False})

        if path == "/api/logout":
            sid, _ = get_session(self)
            if sid and sid in SESSIONS:
                del SESSIONS[sid]
            self.send_response(302)
            self.send_header("Set-Cookie", "lootcheck_sid=; Path=/; Max-Age=0; HttpOnly")
            self.send_header("Location", "/")
            self.end_headers()
            return

        if path == "/auth/login":
            cfg = load_config()
            cid = (cfg.get("EPIC_CLIENT_ID") or "").strip()
            redir = (cfg.get("REDIRECT_URI") or f"http://localhost:{PORT}/auth/callback").strip()
            if not cid or cid.startswith("TON_"):
                return self.send_json({"error": "EPIC_CLIENT_ID manquant. Remplis epic_config.json (voir epic_config.EXEMPLE.json + README-EPIC-OAUTH.md)"}, 500)
            scope = cfg.get("SCOPE", "basic_profile")
            params = urllib.parse.urlencode({
                "client_id": cid,
                "response_type": "code",
                "scope": scope,
                "redirect_uri": redir,
            })
            self.send_response(302)
            self.send_header("Location", f"{EPIC_AUTHORIZE}?{params}")
            self.end_headers()
            return

        if path == "/auth/callback":
            qs = urllib.parse.parse_qs(parsed.query)
            if qs.get("error"):
                html = f"<h1>❌ Connexion Epic refusée</h1><p>{qs.get('error_description', qs.get('error'))}</p><a href='/'>Retour</a>"
                body = html.encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            code = (qs.get("code") or [None])[0]
            if not code:
                self.send_response(302)
                self.send_header("Location", "/callback.html?error=no_code")
                self.end_headers()
                return
            try:
                sess = self.exchange_code(code)
            except Exception as e:
                print("[ERREUR TOKEN]", e)
                self.send_response(302)
                self.send_header("Location", "/callback.html?error=token_failed")
                self.end_headers()
                return
            sid = save_session(sess)
            self.send_response(302)
            self.send_header("Set-Cookie", f"lootcheck_sid={sid}; Path=/; HttpOnly; Max-Age=7200")
            self.send_header("Location", "/callback.html?ok=1")
            self.end_headers()
            return

        return super().do_GET()

    def exchange_code(self, code):
        cfg = load_config()
        cid = cfg["EPIC_CLIENT_ID"].strip()
        csec = cfg["EPIC_CLIENT_SECRET"].strip()
        redir = cfg.get("REDIRECT_URI", f"http://localhost:{PORT}/auth/callback").strip()

        basic = base64.b64encode(f"{cid}:{csec}".encode()).decode()
        data = urllib.parse.urlencode({
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redir,
        }).encode()

        req = urllib.request.Request(EPIC_TOKEN, data=data, method="POST", headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        })
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                tok = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="ignore")
            raise RuntimeError(f"Token HTTP {e.code}: {detail}")

        access = tok.get("access_token")
        account_id = tok.get("account_id")
        if not access:
            raise RuntimeError(f"Pas d'access_token: {tok}")

        # Vrai profil via userInfo
        display_name = None
        try:
            req2 = urllib.request.Request(EPIC_USERINFO, headers={"Authorization": f"Bearer {access}"})
            with urllib.request.urlopen(req2, timeout=20) as r2:
                info = json.loads(r2.read().decode())
            display_name = info.get("dn") or info.get("displayName") or info.get("preferred_username")
            account_id = account_id or info.get("sub")
        except Exception as e:
            print("[WARN userInfo]", e)

        return {
            "access_token": access,
            "account_id": account_id,
            "display_name": display_name or "Joueur Epic",
            "expires_in": tok.get("expires_in"),
        }

if __name__ == "__main__":
    print(f"LOOTCHECK REEL sur http://localhost:{PORT}")
    print(f"   /auth/login    -> vraie page Epic")
    print(f"   /auth/callback -> echange code/token (serveur uniquement)")
    cfg = load_config()
    if not cfg.get("EPIC_CLIENT_ID"):
        print("epic_config.json vide -> mode DEMO. Lis README-EPIC-OAUTH.md pour activer le REEL.")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
