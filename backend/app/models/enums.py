import enum


class AdminRole(str, enum.Enum):
    moderator = "moderator"
    superadmin = "superadmin"


class UserRole(str, enum.Enum):
    moderator = "moderator"
    administrator = "administrator"


class ChatStatus(str, enum.Enum):
    new = "NEW"
    active = "ACTIVE"
    closed = "CLOSED"
    escalated = "ESCALATED"


class MessageDirection(str, enum.Enum):
    inbound = "IN"
    outbound = "OUT"


class MessageType(str, enum.Enum):
    text = "text"
    photo = "photo"
    video = "video"
    video_note = "video_note"
    animation = "animation"
    voice = "voice"
    audio = "audio"
    sticker = "sticker"
    document = "document"
    other = "other"
    system = "system"
