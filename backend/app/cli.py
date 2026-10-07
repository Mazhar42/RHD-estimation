"""Operator commands that must never run as a side effect of app startup.

Usage:
    python -m app.cli create-admin
    python -m app.cli create-admin --username alice --email alice@rhd.gov.bd
"""

import getpass

import click

from .database import SessionLocal
from . import crud, models
from .initial_data import init_db
from .security import get_password_hash


@click.group()
def cli():
    pass


@cli.command("create-admin")
@click.option("--username", prompt=True)
@click.option("--email", prompt=True)
@click.option("--full-name", default="Administrator")
def create_admin(username: str, email: str, full_name: str):
    """Create a superadmin user. Prompts for a password (hidden input) unless
    ADMIN_PASSWORD is set in the environment."""
    import os

    password = os.getenv("ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            raise click.ClickException("Passwords do not match.")
    if len(password) < 12:
        raise click.ClickException("Password must be at least 12 characters.")

    db = SessionLocal()
    try:
        # Make sure the system roles exist (idempotent) before assigning one.
        init_db(db)

        if crud.get_user_by_username(db, username):
            raise click.ClickException(f"Username '{username}' already exists.")
        if crud.get_user_by_email(db, email):
            raise click.ClickException(f"Email '{email}' already exists.")

        user = models.User(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            is_active=True,
        )
        superadmin_role = crud.get_role_by_name(db, "superadmin")
        if not superadmin_role:
            raise click.ClickException("superadmin role not found after seeding roles.")
        user.roles.append(superadmin_role)

        db.add(user)
        db.commit()
        click.echo(f"Created superadmin '{username}' <{email}>.")
    finally:
        db.close()


if __name__ == "__main__":
    cli()
