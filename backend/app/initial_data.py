from sqlalchemy.orm import Session
from . import crud, schemas


def init_db(db: Session):
    """
    Initialize the database with default roles and permissions.
    """
    # 1. Define Permissions
    permissions_list = [
        # Items
        {"name": "items:read", "description": "Read items"},
        {"name": "items:create", "description": "Create items"},
        {"name": "items:update", "description": "Update items"},
        {"name": "items:delete", "description": "Delete items"},
        # Projects
        {"name": "projects:read", "description": "Read projects"},
        {"name": "projects:create", "description": "Create projects"},
        {"name": "projects:update", "description": "Update projects"},
        {"name": "projects:delete", "description": "Delete projects"},
        # Estimations
        {"name": "estimations:read", "description": "Read estimations"},
        {"name": "estimations:create", "description": "Create estimations"},
        {"name": "estimations:update", "description": "Update estimations"},
        {"name": "estimations:delete", "description": "Delete estimations"},
        # Works
        {"name": "works:read", "description": "Read works"},
        {"name": "works:create", "description": "Create works"},
        {"name": "works:update", "description": "Update works"},
        {"name": "works:delete", "description": "Delete works"},
        {"name": "works:purge", "description": "Purge expired works"},
        # Attachments
        {"name": "attachments:read", "description": "Read attachments"},
        {"name": "attachments:create", "description": "Create attachments"},
        {"name": "attachments:delete", "description": "Delete attachments"},
        # Users
        {"name": "users:read", "description": "Read users"},
        {"name": "users:create", "description": "Create users"},
        {"name": "users:update", "description": "Update users"},
        {"name": "users:delete", "description": "Delete users"},
        {"name": "users:activate", "description": "Activate users"},
        {"name": "users:deactivate", "description": "Deactivate users"},
        # Roles
        {"name": "roles:read", "description": "Read roles"},
        {"name": "roles:create", "description": "Create roles"},
        {"name": "roles:update", "description": "Update roles"},
        {"name": "roles:delete", "description": "Delete roles"},
        # Permissions
        {"name": "permissions:read", "description": "Read permissions"},
        {"name": "permissions:create", "description": "Create permissions"},
    ]

    # Create Permissions
    created_permissions = {}
    for perm_data in permissions_list:
        existing_perm = crud.get_permission_by_name(db, perm_data["name"])
        if not existing_perm:
            new_perm = crud.create_permission(db, schemas.PermissionCreate(**perm_data))
            created_permissions[perm_data["name"]] = new_perm
        else:
            created_permissions[perm_data["name"]] = existing_perm

    # 2. Define Roles
    roles_list = [
        {
            "name": "superadmin",
            "description": "Super Administrator with full access",
            "is_system_role": True,
        },
        {
            "name": "admin",
            "description": "Administrator with management access",
            "is_system_role": True,
        },
        {"name": "user", "description": "Standard User", "is_system_role": True},
    ]

    created_roles = {}
    for role_data in roles_list:
        existing_role = crud.get_role_by_name(db, role_data["name"])
        if not existing_role:
            new_role = crud.create_role(
                db,
                schemas.RoleCreate(
                    name=role_data["name"], description=role_data["description"]
                ),
                is_system_role=role_data["is_system_role"],
            )
            created_roles[role_data["name"]] = new_role
        else:
            created_roles[role_data["name"]] = existing_role

    # 3. Assign Permissions to Roles

    # Superadmin: All permissions
    superadmin_role = created_roles["superadmin"]
    for perm_name, perm in created_permissions.items():
        if perm not in superadmin_role.permissions:
            superadmin_role.permissions.append(perm)

    # Admin: All except maybe some high-level system stuff?
    # For now, let's give Admin everything except roles:delete and permissions:create to distinguish from Superadmin
    admin_role = created_roles["admin"]
    for perm_name, perm in created_permissions.items():
        if perm_name not in ["roles:delete", "permissions:create"]:
            if perm not in admin_role.permissions:
                admin_role.permissions.append(perm)

    # User: Basic access
    user_role = created_roles["user"]
    user_perms = [
        "items:read",
        "projects:read",
        "projects:create",
        "projects:update",
        "projects:delete",
        "estimations:read",
        "estimations:create",
        "estimations:update",
        "estimations:delete",
        "works:read",
        "works:create",
        "works:update",
        "works:delete",
        "attachments:read",
        "attachments:create",
        "attachments:delete",
    ]
    for perm_name in user_perms:
        perm = created_permissions.get(perm_name)
        if perm and perm not in user_role.permissions:
            user_role.permissions.append(perm)

    db.commit()
    # Roles/permissions are seeded here because that is idempotent and has no
    # secret material. Privileged user accounts are never created as a side
    # effect of app startup -- use `python -m app.cli create-admin` instead.
