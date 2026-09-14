from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient
import httpx
import pytest

from web import create_app
from mailer import send_transactional_email


@pytest.fixture
def deployed(tmp_path, monkeypatch):
    (tmp_path / 'index.html').write_text('<html>Boxable</html>')
    (tmp_path / 'assets').mkdir()
    (tmp_path / 'assets/app.js').write_text('/* built app */')
    monkeypatch.setenv('PUBLIC_APP_URL', 'https://boxable-test.onrender.com')
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client')
    monkeypatch.setenv('GOOGLE_CLIENT_SECRET', 'test-secret')
    return TestClient(create_app(tmp_path))


def test_same_origin_routes(deployed):
    assert deployed.get('/').text == '<html>Boxable</html>'
    assert deployed.get('/api/health').json()['status'] == 'ok'
    assert deployed.get('/api/missing').status_code == 404
    assert deployed.get('/assets/missing.js').status_code == 404
    assert deployed.get('/assets/app.js').status_code == 200
    assert deployed.get('/.env').status_code == 404
    callback = deployed.get('/auth/google/callback?code=private')
    assert callback.headers['cache-control'] == 'no-store'
    assert callback.headers['referrer-policy'] == 'no-referrer'
    assert 'private' not in callback.text
    assert deployed.post('/api/generate', json={}).status_code == 400


def test_google_identity_scopes_pkce_and_origin(deployed, monkeypatch):
    body = dict(state='s'*43, nonce='a'*64, challenge='c'*43)
    assert deployed.post('/api/auth/google/start', json=body).status_code == 403
    response = deployed.post('/api/auth/google/start', json=body, headers={'origin': 'https://boxable-test.onrender.com'})
    params = parse_qs(urlsplit(response.json()['url']).query)
    assert params['redirect_uri'] == ['https://boxable-test.onrender.com/auth/google/callback']
    assert params['scope'] == ['openid email profile']
    assert params['code_challenge_method'] == ['S256']
    assert params['nonce'] == ['a'*64]
    assert 'test-secret' not in response.text
    monkeypatch.delenv('GOOGLE_CLIENT_SECRET')
    assert deployed.post('/api/auth/google/start', json=body).status_code == 503


def test_google_exchange_and_generic_failures(deployed, monkeypatch):
    captured = {}
    async def post(self, url, data):
        captured.update(data)
        return httpx.Response(200, json={'id_token': 'signed-google-token', 'access_token': 'not-forwarded'})
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    headers = {'origin': 'https://boxable-test.onrender.com'}
    body = {'code': 'one-time-code', 'verifier': 'v'*43}
    result = deployed.post('/api/auth/google/exchange', json=body, headers=headers)
    assert result.json() == {'id_token': 'signed-google-token'}
    assert captured['client_secret'] == 'test-secret'
    assert captured['code_verifier'] == 'v'*43
    assert result.headers['cache-control'] == 'no-store'
    async def failed(self, url, data):
        return httpx.Response(400, json={'error_description': 'private provider detail'})
    monkeypatch.setattr(httpx.AsyncClient, 'post', failed)
    result = deployed.post('/api/auth/google/exchange', json=body, headers=headers)
    assert result.status_code == 400
    assert 'private provider detail' not in result.text


def test_smtp_requires_tls_and_environment(monkeypatch):
    for key, value in dict(SMTP_HOST='smtp-relay.brevo.com', SMTP_PORT='2525', SMTP_USERNAME='login', SMTP_PASSWORD='test-smtp-secret', SMTP_SENDER_EMAIL='sender@example.com', SMTP_SENDER_NAME='Boxable').items():
        monkeypatch.setenv(key, value)
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    factory = MagicMock(return_value=smtp)
    monkeypatch.setattr('mailer.smtplib.SMTP', factory)
    send_transactional_email('recipient@example.com', 'Welcome', 'Your drawer is ready.')
    factory.assert_called_once_with('smtp-relay.brevo.com', 2525, timeout=20)
    assert [call[0] for call in smtp.method_calls] == ['ehlo', 'starttls', 'ehlo', 'login', 'send_message']
    assert smtp.send_message.call_args.args[0]['From'] == 'Boxable <sender@example.com>'
    monkeypatch.delenv('SMTP_PASSWORD')
    with pytest.raises(RuntimeError):
        send_transactional_email('recipient@example.com', 'Welcome', 'Body')
