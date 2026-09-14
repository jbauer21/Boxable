"""Server-only transactional email. No public arbitrary-recipient send endpoint."""
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr


def send_transactional_email(recipient: str, subject: str, text: str):
    required = ["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_SENDER_EMAIL", "SMTP_SENDER_NAME"]
    if any(not os.environ.get(key) for key in required):
        raise RuntimeError("Transactional email is not configured")
    message = EmailMessage()
    message["From"] = formataddr((os.environ["SMTP_SENDER_NAME"], os.environ["SMTP_SENDER_EMAIL"]))
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(text)
    port = int(os.environ.get("SMTP_PORT", "2525"))
    context = ssl.create_default_context()
    if port == 465:
        connection = smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, timeout=20, context=context)
    else:
        connection = smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=20)
    with connection as smtp:
        if port != 465:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(message)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Send a Boxable delivery check to an inbox you control")
    parser.add_argument("recipient")
    args = parser.parse_args()
    try:
        send_transactional_email(args.recipient, "Boxable email delivery check", "Boxable transactional email is connected.")
    except Exception:
        parser.exit(1, "Email delivery failed. Check SMTP settings and sender verification.\n")
    print("Accepted by SMTP server. Verify receipt in the destination inbox.")
