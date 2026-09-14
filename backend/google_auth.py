"""Google authorization-code exchange. Supabase verifies the returned identity.

The browser binds state, nonce and PKCE to its tab. Only this server uses the
client secret; neither tokens nor callback query strings should be logged.
"""
import os
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()


def settings():
    origin = os.environ.get("PUBLIC_APP_URL", os.environ.get("RENDER_EXTERNAL_URL", "")).rstrip("/")
    parsed = urlsplit(origin)
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    if not client_id or not secret or parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        raise HTTPException(503, "Google sign-in is not configured yet")
    return origin, client_id, secret


def check_origin(request, origin):
    if request.headers.get("origin") != origin:
        raise HTTPException(403, "Request must originate from Boxable")


class Start(BaseModel):
    state: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    nonce: str = Field(pattern=r"^[a-f0-9]{64}$")
    challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class Exchange(BaseModel):
    code: str = Field(min_length=1, max_length=4096)
    verifier: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


@router.post("/start")
def start(body: Start, request: Request):
    origin, client_id, _ = settings()
    check_origin(request, origin)
    params = dict(client_id=client_id, redirect_uri=origin + "/auth/google/callback",
                  response_type="code", scope="openid email profile", state=body.state,
                  nonce=body.nonce, code_challenge=body.challenge, code_challenge_method="S256")
    return JSONResponse({"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)},
                        headers={"Cache-Control": "no-store"})


@router.post("/exchange")
async def exchange(body: Exchange, request: Request):
    origin, client_id, secret = settings()
    check_origin(request, origin)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            result = await client.post("https://oauth2.googleapis.com/token", data={
                "code": body.code, "code_verifier": body.verifier,
                "client_id": client_id, "client_secret": secret,
                "redirect_uri": origin + "/auth/google/callback", "grant_type": "authorization_code",
            })
        data = result.json()
        if result.status_code != 200 or not isinstance(data.get("id_token"), str):
            raise ValueError("Authorization failed")
    except (httpx.HTTPError, ValueError):
        raise HTTPException(400, "Sign-in expired or failed. Please try again.") from None
    # This is not a Boxable session. Supabase verifies issuer, audience, signature
    # and nonce before creating the session and applying verified identity linking.
    return JSONResponse({"id_token": data["id_token"]}, headers={"Cache-Control": "no-store"})
