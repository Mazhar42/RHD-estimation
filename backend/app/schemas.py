from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import List, Optional, Literal
from datetime import datetime
from decimal import Decimal

_COMMON_PASSWORDS = {
    "password123",
    "password1234",
    "passw0rd123",
    "letmein12345",
    "welcome12345",
    "changeme123",
    "qwertyuiop12",
    "administrator1",
}


def _validate_password_strength(value: str) -> str:
    if len(value) < 12:
        raise ValueError("Password must be at least 12 characters long")
    if value.lower() in _COMMON_PASSWORDS:
        raise ValueError("Password is too common; choose a less predictable one")
    return value


# =============== Authentication Schemas ===============


# Permission Schemas
class PermissionBase(BaseModel):
    name: str
    description: Optional[str] = None


class PermissionCreate(PermissionBase):
    pass


class Permission(PermissionBase):
    permission_id: int

    model_config = ConfigDict(from_attributes=True)


# Role Schemas
class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class Role(RoleBase):
    role_id: int
    is_system_role: bool
    created_at: datetime
    permissions: List[Permission] = []

    model_config = ConfigDict(from_attributes=True)


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str

    _check_password = field_validator("password")(_validate_password_strength)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None

    _check_password = field_validator("password")(
        lambda v: _validate_password_strength(v) if v is not None else v
    )


class UserPasswordChange(BaseModel):
    old_password: str
    new_password: str

    _check_new_password = field_validator("new_password")(_validate_password_strength)


class User(UserBase):
    user_id: int
    is_active: bool
    created_at: datetime
    roles: List[Role] = []

    model_config = ConfigDict(from_attributes=True)


class UserWithPassword(User):
    hashed_password: str


class AuditUser(BaseModel):
    user_id: int
    username: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: User


class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None


class LoginRequest(BaseModel):
    username: str
    password: str


# =============== Invite Schemas ===============
# Self-service registration is closed; new accounts are created by an admin
# issuing a one-time invite link, which the recipient uses to set their own
# username/password (see routers/auth.py).


class InviteCreate(BaseModel):
    email: EmailStr
    role_name: str = "user"


class InviteIssued(BaseModel):
    """Returned once, at issue time, to the admin who created the invite.
    `token` is the only place the raw (unhashed) token is ever exposed."""

    email: EmailStr
    token: str
    expires_at: datetime


class InviteInfo(BaseModel):
    """Public-safe preview shown to the invitee before they accept."""

    email: EmailStr
    role_name: str
    expires_at: datetime


class InviteAccept(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None

    _check_password = field_validator("password")(_validate_password_strength)


# =============== Other Schemas ===============
class DivisionBase(BaseModel):
    name: str


class DivisionCreate(DivisionBase):
    # Optional during transition; default will be RHD if omitted
    organization_id: Optional[int] = None


class Division(DivisionBase):
    division_id: int
    organization_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# Organization Schemas
class OrganizationBase(BaseModel):
    name: str


class OrganizationCreate(OrganizationBase):
    pass


class Organization(OrganizationBase):
    org_id: int

    model_config = ConfigDict(from_attributes=True)


class OrganizationUpdate(BaseModel):
    name: str | None = None


# Region Schemas
class RegionBase(BaseModel):
    name: str


class RegionCreate(RegionBase):
    organization_id: int


class Region(RegionBase):
    region_id: int
    organization_id: int

    model_config = ConfigDict(from_attributes=True)


class RegionUpdate(BaseModel):
    name: str | None = None


# Item Schemas
class SpecialItemBase(BaseModel):
    item_code: str
    item_description: str
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: str
    organization: str = "RHD"
    rate_year: Optional[int] = None


class SpecialItem(SpecialItemBase):
    special_item_id: int
    item_id: int
    division_id: int
    division: Division
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemBase(BaseModel):
    item_code: str
    item_description: str
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: str
    organization: str = "RHD"
    rate_year: Optional[int] = None


class ItemCreate(ItemBase):
    division_id: int


class ItemUpdate(BaseModel):
    item_code: Optional[str] = None
    item_description: Optional[str] = None
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: Optional[str] = None
    division_id: Optional[int] = None
    organization: Optional[str] = None
    rate_year: Optional[int] = None


class ItemParsed(BaseModel):
    division: str
    item_code: str
    item_description: str
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: str
    organization: Optional[str] = "RHD"
    rate_year: Optional[int] = None


class Item(ItemBase):
    item_id: int
    division_id: int
    division: Division
    special_item: Optional[SpecialItem] = None

    model_config = ConfigDict(from_attributes=True)


# Project Schemas
class ProjectBase(BaseModel):
    project_name: str
    client_name: Optional[str] = None
    summary: Optional[str] = None
    geometry_kind: Optional[str] = None


class ProjectCreate(ProjectBase):
    name_id: Optional[str] = None


class Project(ProjectBase):
    project_id: int
    name_id: str
    status: str
    last_opened_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    purged_at: Optional[datetime] = None
    archived_line_count: int = 0
    archived_estimation_count: int = 0
    archived_attachment_count: int = 0
    archived_total: Decimal = Decimal("0")
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[AuditUser] = None
    updated_by: Optional[AuditUser] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    summary: Optional[str] = None
    geometry_kind: Optional[str] = None


class GeoPointBase(BaseModel):
    seq: int
    latitude: Decimal
    longitude: Decimal
    label: Optional[str] = None


class GeoPointCreate(GeoPointBase):
    pass


class GeoPoint(GeoPointBase):
    geo_point_id: int
    owner_type: str
    owner_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttachmentBase(BaseModel):
    filename: str
    content_type: str
    kind: str
    byte_size: int
    checksum_sha256: str
    sort_order: int = 0


class Attachment(AttachmentBase):
    attachment_id: int
    owner_type: str
    owner_id: int
    storage_backend: str
    storage_key: Optional[str] = None
    uploaded_by_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttachmentUpdate(BaseModel):
    filename: Optional[str] = None
    sort_order: Optional[int] = None


class WorkSnapshotBase(BaseModel):
    version: int
    kind: str
    payload_size: int
    line_count: int
    grand_total: Optional[Decimal] = None


class WorkSnapshot(WorkSnapshotBase):
    snapshot_id: int
    project_id: int
    created_by_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkSnapshotDetail(WorkSnapshot):
    manifest: dict


class WorkCheckpointCreate(BaseModel):
    kind: Literal["auto", "manual", "pre_restore"]


class WorkEstimationSummary(BaseModel):
    estimation_id: int
    estimation_name: str
    region: Optional[str] = None
    organization: str = "RHD"
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WorkConflict(BaseModel):
    project_id: int
    name_id: str
    owner_username: Optional[str] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    status: str


class WorkNameIdCheckResponse(BaseModel):
    available: bool
    reason: Optional[str] = None
    conflict: Optional[WorkConflict] = None
    suggestion: str


class WorkCreate(BaseModel):
    name_id: str
    project_name: str
    estimation_name: str
    client_name: Optional[str] = None
    summary: Optional[str] = None
    region: str = "Default"
    organization: str = "RHD"
    # Defaults to Road so this quick project+estimation flow keeps working
    # without asking for it up front; callers that care can pass explicitly.
    work_type_codes: List[str] = Field(default_factory=lambda: ["road"], min_length=1)
    rate_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    geometry_kind: Optional[Literal["point", "line", "area"]] = None
    geo_points: List[GeoPointCreate] = Field(default_factory=list)


class WorkUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    summary: Optional[str] = None
    geometry_kind: Optional[Literal["point", "line", "area"]] = None


class WorkSummary(Project):
    primary_estimation_id: Optional[int] = None
    geo_points: List[GeoPoint] = Field(default_factory=list)


class WorkDetail(WorkSummary):
    estimations: List[WorkEstimationSummary] = Field(default_factory=list)
    attachments: List[Attachment] = Field(default_factory=list)
    last_checkpoint_at: Optional[datetime] = None


class GeoReplaceRequest(BaseModel):
    geometry_kind: Literal["point", "line", "area"]
    points: List[GeoPointCreate] = Field(default_factory=list)


class WorkExportProjectAttachment(BaseModel):
    attachment_id: Optional[int] = None
    path: str
    filename: str
    content_type: str
    byte_size: int
    sha256: str


class WorkExportItemRef(BaseModel):
    item_code: Optional[str] = None
    item_description: str
    unit: Optional[str] = None
    rate: Optional[str] = None
    region: Optional[str] = None
    organization: Optional[str] = None
    division_name: Optional[str] = None
    is_special: bool = False


class WorkExportElement(BaseModel):
    local_id: str
    work_type: str
    kind: str
    code: str
    label: Optional[str] = None
    structure_name: str = ""
    chainage_from_m: Optional[str] = None
    chainage_to_m: Optional[str] = None
    sort_order: int = 0


class WorkExportLine(BaseModel):
    local_id: str
    parent_local_id: Optional[str] = None
    # Optional with a default so v1 packages and pre-existing snapshots, which
    # have no elements at all, still validate.
    element_local_id: Optional[str] = None
    sort_order: int
    geometry_kind: Optional[str] = None
    label: Optional[str] = None
    entry_status: str = "entered"
    geo_points: List[GeoPointCreate] = Field(default_factory=list)
    attachments: List[WorkExportProjectAttachment] = Field(default_factory=list)
    item: WorkExportItemRef
    sub_description: Optional[str] = None
    no_of_units: Optional[str] = None
    no_of_units_expr: Optional[str] = None
    length: Optional[str] = None
    width: Optional[str] = None
    thickness: Optional[str] = None
    length_expr: Optional[str] = None
    width_expr: Optional[str] = None
    thickness_expr: Optional[str] = None
    quantity: Optional[str] = None
    calculated_qty: Optional[str] = None
    rate: Optional[str] = None
    amount: Optional[str] = None


class WorkExportEstimation(BaseModel):
    estimation_name: str
    region: Optional[str] = None
    organization: str
    elements: List[WorkExportElement] = Field(default_factory=list)
    lines: List[WorkExportLine] = Field(default_factory=list)


class WorkExportProject(BaseModel):
    name_id: str
    project_name: str
    summary: Optional[str] = None
    client_name: Optional[str] = None
    geometry_kind: Optional[str] = None
    geo_points: List[GeoPointCreate] = Field(default_factory=list)
    attachments: List[WorkExportProjectAttachment] = Field(default_factory=list)


class WorkExportManifest(BaseModel):
    format: Literal["rhd-est"]
    format_version: int
    exported_at: datetime
    exported_by: Optional[str] = None
    project: WorkExportProject
    estimations: List[WorkExportEstimation] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)


class WorkImportResponse(BaseModel):
    project_id: int
    primary_estimation_id: int
    lines_imported: int
    lines_skipped: int
    items_exact: int
    items_remapped: int
    items_missing: List[str] = Field(default_factory=list)
    special_requests_created: int = 0
    attachments_imported: int = 0
    warnings: List[str] = Field(default_factory=list)


class SnapshotRestoreResponse(BaseModel):
    project_id: int
    restored_snapshot_id: int
    primary_estimation_id: Optional[int] = None
    warnings: List[str] = Field(default_factory=list)


class PurgeRequest(BaseModel):
    dry_run: bool = False
    limit: int = 500


class PurgeReport(BaseModel):
    dry_run: bool
    candidates: int
    purged_project_ids: List[int] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class UserSettingsBase(BaseModel):
    autosave_interval_minutes: int = 5
    print_font_family: str = "helvetica"
    print_font_size: int = 9


class UserSettingsUpdate(UserSettingsBase):
    pass


class UserSettings(UserSettingsBase):
    user_id: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Estimation Schemas
# --- Structural elements -----------------------------------------------------
# A physical part of the work: a bridge element (A1, P1..PN, A2) or a road
# chainage segment ("0+000 - 1+250"). NOTE: `work_type` means road-vs-bridge and
# is unrelated to the pre-existing `geometry_kind` (point/line/area).

# Validated dynamically against the work_types catalog / the owning
# estimation's header-level selection (services/elements.py), not a fixed
# Literal, since work types are now data (see WorkType below).
ElementWorkType = str
ElementKind = Literal["abutment", "pier", "span", "chainage", "other"]


class WorkType(BaseModel):
    code: str
    label: str
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class StructuralElementBase(BaseModel):
    work_type: ElementWorkType
    kind: ElementKind
    code: str
    label: Optional[str] = None
    structure_name: str = ""
    chainage_from_m: Optional[float] = None
    chainage_to_m: Optional[float] = None
    sort_order: int = 0


class StructuralElementCreate(StructuralElementBase):
    # For kind="chainage" these accept "1+250" style strings and `code` is
    # derived from them; the raw numeric fields above are then ignored.
    chainage_from: Optional[str] = None
    chainage_to: Optional[str] = None


class StructuralElementUpdate(BaseModel):
    work_type: Optional[ElementWorkType] = None
    kind: Optional[ElementKind] = None
    code: Optional[str] = None
    label: Optional[str] = None
    structure_name: Optional[str] = None
    chainage_from: Optional[str] = None
    chainage_to: Optional[str] = None
    sort_order: Optional[int] = None


class StructuralElement(StructuralElementBase):
    element_id: int
    estimation_id: int

    model_config = ConfigDict(from_attributes=True)


class BridgeElementsGenerate(BaseModel):
    structure_name: str = ""
    pier_count: int = Field(ge=0, le=200)
    include_abutments: bool = True


class RoadElementsGenerate(BaseModel):
    structure_name: str = ""
    # Either explicit breakpoints ("0+000", "1+250", "3+500") ...
    breakpoints: Optional[List[str]] = None
    # ... or a start/end plus a fixed segment length.
    start: Optional[str] = None
    end: Optional[str] = None
    segment_length_m: Optional[float] = Field(default=None, gt=0)
    # A span that does not divide evenly leaves a stub; "merge" folds it into
    # the last segment, "split" keeps it as its own short segment.
    remainder: Literal["merge", "split"] = "merge"


class SubItemsGenerate(BaseModel):
    """Break one item line into per-element sub-items.

    A bridge item is split across A1/P1..PN/A2, a road item across chainage
    segments, and anything else across free-form named parts. Pass
    `element_ids` to hang the item off elements that already exist instead of
    generating a new framework.
    """

    mode: Literal["bridge", "road", "other", "custom"]
    # Reuse existing elements; when set the generator fields below are ignored.
    element_ids: Optional[List[int]] = None
    structure_name: str = ""
    # mode="bridge"
    pier_count: Optional[int] = Field(default=None, ge=0, le=200)
    include_abutments: bool = True
    # mode="road"
    breakpoints: Optional[List[str]] = None
    start: Optional[str] = None
    end: Optional[str] = None
    segment_length_m: Optional[float] = Field(default=None, gt=0)
    remainder: Literal["merge", "split"] = "merge"
    # mode="other" -- one element per distinct name, under the work type the
    # caller is currently working in (bridge/road are implied by the mode).
    names: Optional[List[str]] = None
    work_type: Optional[str] = None


class ElementAssignRequest(BaseModel):
    line_ids: List[int]
    element_id: Optional[int] = None


class ElementValidationIssue(BaseModel):
    code: Literal["chainage_overlap", "chainage_gap", "chainage_reversed"]
    message: str
    element_ids: List[int] = Field(default_factory=list)


class ElementValidationReport(BaseModel):
    issues: List[ElementValidationIssue] = Field(default_factory=list)


class EstimationLineBase(BaseModel):
    item_id: int
    parent_line_id: Optional[int] = None
    element_id: Optional[int] = None
    sort_order: int = 0
    geometry_kind: Optional[str] = None
    label: Optional[str] = None
    entry_status: str = "entered"
    sub_description: Optional[str] = None
    no_of_units: float | None = 1
    no_of_units_expr: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    thickness: Optional[float] = None
    length_expr: Optional[str] = None
    width_expr: Optional[str] = None
    thickness_expr: Optional[str] = None
    quantity: Optional[float] = None
    attachments: List[Attachment] = Field(default_factory=list)
    geo_points: List[GeoPoint] = Field(default_factory=list)


class SpecialItemRequestReject(BaseModel):
    reason: Optional[str] = None


class SpecialItemRequest(BaseModel):
    request_id: int
    estimation_id: int
    division_id: int
    item_description: str
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: str
    organization: str
    item_code: Optional[str] = None
    element_id: Optional[int] = None
    attachments: List[Attachment] = Field(default_factory=list)
    sub_description: Optional[str] = None
    no_of_units: float | None = 1
    no_of_units_expr: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    thickness: Optional[float] = None
    length_expr: Optional[str] = None
    width_expr: Optional[str] = None
    thickness_expr: Optional[str] = None
    quantity: Optional[float] = None
    status: str
    reason: Optional[str] = None
    requested_by_id: int
    reviewed_by_id: Optional[int] = None
    item_id: Optional[int] = None
    special_item_id: Optional[int] = None
    line_id: Optional[int] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    requested_by: Optional[AuditUser] = None
    reviewed_by: Optional[AuditUser] = None

    model_config = ConfigDict(from_attributes=True)


class EstimationLineCreate(BaseModel):
    item_id: int
    parent_line_id: int | None = None
    # Honoured on root lines only; a child always inherits its parent's element.
    element_id: int | None = None
    sort_order: int = 0
    geometry_kind: str | None = None
    label: str | None = None
    entry_status: str = "entered"
    sub_description: str | None = None
    no_of_units: float | None = 1
    no_of_units_expr: str | None = None
    length: float | None = None
    width: float | None = None
    thickness: float | None = None
    length_expr: str | None = None
    width_expr: str | None = None
    thickness_expr: str | None = None
    quantity: float | None = None


class EstimationLineCreateBatch(BaseModel):
    lines: List[EstimationLineCreate]


class EstimationLineUpdate(BaseModel):
    item_id: int | None = None
    parent_line_id: int | None = None
    # Honoured on root lines only; a child always inherits its parent's element.
    element_id: int | None = None
    sort_order: int | None = None
    geometry_kind: str | None = None
    label: str | None = None
    sub_description: str | None = None
    no_of_units: float | None = None
    no_of_units_expr: str | None = None
    length: float | None = None
    width: float | None = None
    thickness: float | None = None
    length_expr: str | None = None
    width_expr: str | None = None
    thickness_expr: str | None = None
    quantity: float | None = None
    # Optimistic concurrency: when set, must match the line's current
    # `version` (as last read by the client) or the update is rejected with
    # 409 instead of silently overwriting a change made in between. Omit to
    # skip the check (existing/non-browser callers keep working unchanged).
    expected_version: int | None = None


class EstimationLine(EstimationLineBase):
    line_id: int
    estimation_id: int
    calculated_qty: Optional[float] = None
    rate: Optional[float] = None
    amount: Optional[float] = None
    item: Item
    version: int = 1

    model_config = ConfigDict(from_attributes=True)


class EstimationLineTree(EstimationLine):
    children: List["EstimationLineTree"] = Field(default_factory=list)


class EstimationBase(BaseModel):
    estimation_name: str
    region: Optional[str] = None
    organization: str = "RHD"
    rate_year: Optional[int] = None
    geometry_kind: Optional[Literal["point", "line", "area"]] = None


class EstimationCreate(EstimationBase):
    # At least one work type (road/bridge/building/...) is mandatory, same as
    # region -- it drives which tabs the estimation gets.
    work_type_codes: List[str] = Field(min_length=1)
    # UI default only for the Item Master / Special Item Requests toggle
    # nested inside each work-type tab; both kinds can coexist regardless.
    default_line_mode: Literal["item", "special"] = "item"
    # The alignment drawn on the map while creating the estimation. Stored as
    # geo_points with owner_type='estimation'.
    geo_points: List[GeoPointCreate] = Field(default_factory=list)


class Estimation(EstimationBase):
    estimation_id: int
    project_id: int
    geo_points: List[GeoPoint] = Field(default_factory=list)
    lines: List[EstimationLine] = []
    work_types: List[WorkType] = []
    default_line_mode: str = "item"
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[AuditUser] = None
    updated_by: Optional[AuditUser] = None
    version: int = 1

    model_config = ConfigDict(from_attributes=True)


class SpecialItemRequestCreate(BaseModel):
    division_id: int
    item_description: str
    unit: Optional[str] = None
    rate: Optional[float] = None
    region: str
    organization: str
    item_code: Optional[str] = None
    element_id: Optional[int] = None
    sub_description: Optional[str] = None
    no_of_units: float | None = 1
    no_of_units_expr: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    thickness: Optional[float] = None
    length_expr: Optional[str] = None
    width_expr: Optional[str] = None
    thickness_expr: Optional[str] = None
    quantity: Optional[float] = None


class SpecialItemRequestCreateBatch(BaseModel):
    requests: List[SpecialItemRequestCreate]


class EstimationUpdate(BaseModel):
    estimation_name: Optional[str] = None
    region: Optional[str] = None
    organization: Optional[str] = None
    rate_year: Optional[int] = None
    geometry_kind: Optional[Literal["point", "line", "area"]] = None
    # Add-only: removing a code that's still in use by a StructuralElement is
    # rejected (services/elements.py). Omit the field to leave selection as-is.
    work_type_codes: Optional[List[str]] = None
    default_line_mode: Optional[Literal["item", "special"]] = None
    # See EstimationLineUpdate.expected_version.
    expected_version: int | None = None


class WorkTypeSummary(BaseModel):
    work_type: WorkType
    standard_total: float = 0
    special_total: float = 0
    total: float = 0


class EstimationSummary(BaseModel):
    estimation_id: int
    unassigned_total: float = 0
    work_types: List[WorkTypeSummary] = []
    grand_total: float = 0
    pending_line_count: int = 0


class EstimationLineDelete(BaseModel):
    line_ids: List[int]


class EstimationLineReorderMove(BaseModel):
    line_id: int
    parent_line_id: int | None = None
    sort_order: int


class EstimationLineReorderRequest(BaseModel):
    moves: List[EstimationLineReorderMove]


class EstimationLineDuplicateRequest(BaseModel):
    line_ids: List[int]
    include_children: bool = True
    include_attachments: bool = True
    include_geo: bool = True


EstimationLineTree.model_rebuild()
