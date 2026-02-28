from sqlalchemy import BigInteger, Boolean, Column, DateTime, Float, Integer, String, func

from database.models import Base, User


class ExtendedUser(User):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    card_number = Column(String(128), nullable=True)
    partner_balance = Column(Float, nullable=False, server_default="0")
    payout_method = Column(String(20), nullable=False, server_default="card")

    partner_percent = Column(Float, nullable=True)
    partner_percent_custom = Column(Boolean, nullable=False, server_default="false")
    partner_code = Column(String(64), nullable=True, unique=True)


class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True)
    partner_tg_id = Column(BigInteger, nullable=False)
    joined_tg_id = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class PayoutRequest(Base):
    __tablename__ = "payout_requests"

    id = Column(Integer, primary_key=True)
    tg_id = Column(BigInteger, nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String(20), nullable=False, server_default="pending")
    created_at = Column(DateTime, server_default=func.now())