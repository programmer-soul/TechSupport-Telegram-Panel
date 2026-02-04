#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app')

from app.auth.crypto import hash_secret

# Generate hash for 'admin' password
password = "admin"
hashed = hash_secret(password)
print(hashed)
