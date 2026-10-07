from sqlalchemy import (
    Column,
    Integer,
    SmallInteger,
    String,
    ForeignKey,
    Numeric,
    Text,
    UniqueConstraint,
    Boolean,
    DateTime,
    Table,
    LargeBinary,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .database import Base
from datetime import datetime

# Association table for User-Role many-to-many relationship
user_roles_association = Table(
    "user_roles",
    Base.metadata,
    Column(
        "user_id",
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "role_id",
        Integer,
        ForeignKey("roles.role_id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Association table for Role-Permission many-to-many relationship
role_permissions_association = Table(
    "role_permissions",
    Base.metadata,
    Column(
        "role_id",
        Integer,
        ForeignKey("roles.role_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "permission_id",
        Integer,
        ForeignKey("permissions.permission_id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# Association table for the header-level work-type selection of an Estimation
# (e.g. an estimation covering Road + Bridge work). Distinct from
# StructuralElement.work_type, which tags each individual breakdown element.
estimation_work_types_association = Table(
    "estimation_work_types",
    Base.metadata,
    Column(
        "estimation_id",
        Integer,
        ForeignKey("estimations.estimation_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "work_type_code", String(20), ForeignKey("work_types.code"), primary_key=True
    ),
)


class Permission(Base):
    __tablename__ = "permissions"
    permission_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    roles = relationship(
        "Role", secondary=role_permissions_association, back_populates="permissions"
    )


class Role(Base):
    __tablename__ = "roles"
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    users = relationship(
        "User", secondary=user_roles_association, back_populates="roles"
    )
    permissions = relationship(
        "Permission", secondary=role_permissions_association, back_populates="roles"
    )


class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    roles = relationship(
        "Role", secondary=user_roles_association, back_populates="users"
    )
    settings = relationship(
        "UserSettings",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Organization(Base):
    __tablename__ = "organizations"
    org_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    divisions = relationship(
        "Division", back_populates="organization", cascade="all, delete-orphan"
    )
    regions = relationship(
        "Region", back_populates="organization", cascade="all, delete-orphan"
    )


class Region(Base):
    __tablename__ = "regions"
    region_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.org_id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    organization = relationship("Organization", back_populates="regions")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_org_region_name"),
    )


class Division(Base):
    __tablename__ = "divisions"
    division_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Link division to owning organization (startup migration will backfill to RHD)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.org_id"), nullable=True
    )

    organization = relationship("Organization", back_populates="divisions")
    items = relationship(
        "Item", back_populates="division", cascade="all, delete-orphan"
    )
    special_items = relationship(
        "SpecialItem", back_populates="division", cascade="all, delete-orphan"
    )


class Item(Base):
    __tablename__ = "items"
    item_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    division_id: Mapped[int] = mapped_column(
        ForeignKey("divisions.division_id"), nullable=False
    )
    item_code: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    region: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="Default"
    )
    # Organization owning the rate; default to 'RHD'
    organization: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="RHD"
    )
    # Schedule / fiscal year the rate belongs to. Lets RHD / LGED / PWD each keep
    # more than one year of rates side by side (meeting item 8).
    rate_year: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="2025"
    )

    division = relationship("Division", back_populates="items")
    # historical relationships from earlier design not strictly required
    estimation_lines = relationship("EstimationLine", back_populates="item")
    special_item = relationship(
        "SpecialItem",
        back_populates="item",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "item_code",
            "region",
            "organization",
            "rate_year",
            name="uq_item_code_region_org_year",
        ),
    )


class SpecialItem(Base):
    __tablename__ = "special_items"
    special_item_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.item_id"), nullable=False, unique=True
    )
    division_id: Mapped[int] = mapped_column(
        ForeignKey("divisions.division_id"), nullable=False
    )
    item_code: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    region: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="Default"
    )
    organization: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="RHD"
    )
    rate_year: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="2025"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    division = relationship("Division", back_populates="special_items")
    item = relationship("Item", back_populates="special_item")


class WorkType(Base):
    """Catalog of estimation work types (road, bridge, building, ...).

    Kept as a table rather than a hardcoded CHECK constraint so a new
    category (e.g. building) is a data row, not a migration touching a
    constraint.
    """

    __tablename__ = "work_types"
    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    estimations = relationship(
        "Estimation",
        secondary=estimation_work_types_association,
        back_populates="work_types",
    )


class Project(Base):
    __tablename__ = "projects"
    project_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name_id_norm: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    geometry_kind: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )
    purged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    archived_line_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    archived_estimation_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    archived_attachment_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    archived_total: Mapped[float] = mapped_column(
        Numeric(18, 2), nullable=False, default=0, server_default="0"
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    estimations = relationship(
        "Estimation", back_populates="project", cascade="all, delete-orphan"
    )
    snapshots = relationship(
        "WorkSnapshot", back_populates="project", cascade="all, delete-orphan"
    )
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class Estimation(Base):
    __tablename__ = "estimations"
    estimation_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.project_id"), nullable=False
    )
    estimation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str | None] = mapped_column(String(50), nullable=True)
    organization: Mapped[str] = mapped_column(
        String(50), nullable=False, default="RHD", server_default="RHD"
    )
    # Which item-master schedule year to price this estimation against. NULL
    # means "use the newest year available for this organization".
    rate_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # point / line / area for the alignment drawn on the map when the
    # estimation is created. Its coordinates live in geo_points with
    # owner_type='estimation'.
    geometry_kind: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Default form ("pick a master item" vs "request a special item") shown
    # when adding a line; a UI preference only -- both kinds of line can
    # coexist within any work-type tab regardless of this setting.
    default_line_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, default="item", server_default="item"
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    updated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    # Optimistic concurrency: SQLAlchemy bumps this on every UPDATE and
    # raises StaleDataError if the in-memory row's version no longer
    # matches the DB (see routers/estimations.py's handler for that).
    # Bumps on any line edit too, via recompute_estimation touching
    # updated_at -- that's intentional: "version" means "this estimation,
    # including its rolled-up totals, has changed," not just its own
    # header fields.
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    project = relationship("Project", back_populates="estimations")
    lines = relationship(
        "EstimationLine", back_populates="estimation", cascade="all, delete-orphan"
    )
    elements = relationship(
        "StructuralElement",
        back_populates="estimation",
        cascade="all, delete-orphan",
        order_by="StructuralElement.sort_order",
    )
    work_types = relationship(
        "WorkType",
        secondary=estimation_work_types_association,
        back_populates="estimations",
        order_by="WorkType.sort_order",
    )
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])

    __table_args__ = (
        CheckConstraint(
            "default_line_mode IN ('item', 'special')",
            name="ck_estimations_default_line_mode",
        ),
    )
    __mapper_args__ = {"version_id_col": version}


class StructuralElement(Base):
    """A physical part of the work an estimation is broken down by.

    For bridges these are the substructure elements -- A1, P1..PN, A2 (A =
    abutment, P = pier). For roads they are chainage segments such as
    "0+000-1+250" (chainage 1+250 means 1250 metres).

    NOTE: ``work_type`` here means road-vs-bridge. It is NOT the same thing as
    the pre-existing ``geometry_kind`` on Project/EstimationLine, which means
    point/line/area for GPS purposes.
    """

    __tablename__ = "structural_elements"
    element_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    estimation_id: Mapped[int] = mapped_column(
        ForeignKey("estimations.estimation_id", ondelete="CASCADE"), nullable=False
    )
    # FK into the work_types catalog rather than a hardcoded CHECK -- also
    # validated at the service layer against the owning estimation's
    # header-level work-type selection (services/elements.py).
    work_type: Mapped[str] = mapped_column(
        String(10), ForeignKey("work_types.code"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # NOT NULL defaulting to '' on purpose: UNIQUE treats NULLs as distinct on
    # both SQLite and Postgres, which would silently allow duplicate codes.
    structure_name: Mapped[str] = mapped_column(
        String(255), nullable=False, default="", server_default=""
    )
    chainage_from_m: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    chainage_to_m: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    estimation = relationship("Estimation", back_populates="elements")
    lines = relationship("EstimationLine", back_populates="element")

    __table_args__ = (
        CheckConstraint(
            "chainage_from_m IS NULL OR chainage_to_m IS NULL OR chainage_to_m > chainage_from_m",
            name="ck_structural_elements_chainage_range",
        ),
        UniqueConstraint(
            "estimation_id",
            "structure_name",
            "code",
            name="uq_structural_elements_estimation_code",
        ),
        Index("idx_structural_elements_estimation_sort", "estimation_id", "sort_order"),
    )


class EstimationLine(Base):
    __tablename__ = "estimation_lines"
    line_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    estimation_id: Mapped[int] = mapped_column(
        ForeignKey("estimations.estimation_id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.item_id"), nullable=False)
    parent_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("estimation_lines.line_id", ondelete="CASCADE"), nullable=True
    )
    # Authoritative on root lines only; children inherit their parent's element.
    element_id: Mapped[int | None] = mapped_column(
        ForeignKey("structural_elements.element_id", ondelete="SET NULL"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    geometry_kind: Mapped[str | None] = mapped_column(String(10), nullable=True)

    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entry_status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="entered", server_default="entered"
    )

    sub_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    no_of_units: Mapped[float | None] = mapped_column(
        Numeric(15, 3), nullable=True, default=1
    )
    no_of_units_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    length: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    width: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    thickness: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    length_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    width_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thickness_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    calculated_qty: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    # Optimistic concurrency -- see Estimation.version. Only actually bumps
    # when a tracked column's value genuinely changes, so an aggregate
    # parent's version changes when its rolled-up totals do, and an
    # untouched sibling's does not.
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    estimation = relationship("Estimation", back_populates="lines")
    item = relationship("Item", back_populates="estimation_lines")
    element = relationship("StructuralElement", back_populates="lines")
    parent = relationship(
        "EstimationLine", remote_side=[line_id], back_populates="children"
    )
    children = relationship(
        "EstimationLine",
        back_populates="parent",
        cascade="all, delete-orphan",
        single_parent=True,
    )

    __table_args__ = (
        Index("idx_estimation_lines_parent_line_id", "parent_line_id"),
        Index(
            "idx_estimation_lines_estimation_parent_sort",
            "estimation_id",
            "parent_line_id",
            "sort_order",
        ),
        Index("idx_estimation_lines_element_id", "element_id"),
    )
    __mapper_args__ = {"version_id_col": version}


class SpecialItemRequest(Base):
    __tablename__ = "special_item_requests"
    request_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    estimation_id: Mapped[int] = mapped_column(
        ForeignKey("estimations.estimation_id", ondelete="CASCADE"), nullable=False
    )
    division_id: Mapped[int] = mapped_column(
        ForeignKey("divisions.division_id"), nullable=False
    )
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    organization: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="RHD"
    )
    item_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    element_id: Mapped[int | None] = mapped_column(
        ForeignKey("structural_elements.element_id", ondelete="SET NULL"), nullable=True
    )
    sub_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    no_of_units: Mapped[float | None] = mapped_column(
        Numeric(15, 3), nullable=True, default=1
    )
    no_of_units_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    length: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    width: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    thickness: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    length_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    width_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thickness_expr: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(15, 3), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.item_id"), nullable=True
    )
    special_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("special_items.special_item_id"), nullable=True
    )
    line_id: Mapped[int | None] = mapped_column(
        ForeignKey("estimation_lines.line_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    estimation = relationship("Estimation")
    division = relationship("Division")
    element = relationship("StructuralElement")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    item = relationship("Item")
    special_item = relationship("SpecialItem")
    line = relationship("EstimationLine")


class GeoPoint(Base):
    __tablename__ = "geo_points"
    geo_point_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_type: Mapped[str] = mapped_column(String(20), nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(10, 7), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "owner_type", "owner_id", "seq", name="uq_geo_points_owner_seq"
        ),
        CheckConstraint(
            "latitude >= -90 AND latitude <= 90", name="ck_geo_points_latitude_range"
        ),
        CheckConstraint(
            "longitude >= -180 AND longitude <= 180",
            name="ck_geo_points_longitude_range",
        ),
    )


class Attachment(Base):
    __tablename__ = "attachments"
    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    owner_type: Mapped[str] = mapped_column(String(24), nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_backend: Mapped[str] = mapped_column(
        String(16), nullable=False, default="db", server_default="db"
    )
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    data: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, deferred=True
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    uploaded_by = relationship("User")

    __table_args__ = (
        CheckConstraint("byte_size <= 10485760", name="ck_attachments_byte_size"),
        Index("idx_attachments_owner_sort", "owner_type", "owner_id", "sort_order"),
        Index("idx_attachments_checksum_sha256", "checksum_sha256"),
    )


class WorkSnapshot(Base):
    __tablename__ = "work_snapshots"
    snapshot_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    payload_size: Mapped[int] = mapped_column(Integer, nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, nullable=False)
    grand_total: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    project = relationship("Project", back_populates="snapshots")
    created_by = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "project_id", "version", name="uq_work_snapshots_project_version"
        ),
    )


class UserInvite(Base):
    """A one-time link an admin issues so a new user can set their own
    password, instead of the app taking self-service registration or an
    admin having to know/set the user's password directly."""

    __tablename__ = "user_invites"
    invite_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.role_id"), nullable=False)
    invited_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    role = relationship("Role")
    invited_by = relationship("User")


class UserSettings(Base):
    __tablename__ = "user_settings"
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    autosave_interval_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5, server_default="5"
    )
    print_font_family: Mapped[str] = mapped_column(
        String(32), nullable=False, default="helvetica", server_default="helvetica"
    )
    print_font_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=9, server_default="9"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    user = relationship("User", back_populates="settings")

    __table_args__ = (
        CheckConstraint(
            "autosave_interval_minutes IN (5, 10, 30)",
            name="ck_user_settings_autosave_interval",
        ),
        CheckConstraint(
            "print_font_size BETWEEN 6 AND 18", name="ck_user_settings_print_font_size"
        ),
    )
