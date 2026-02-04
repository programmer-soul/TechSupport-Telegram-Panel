#!/bin/bash
docker exec techweb-db-1 psql -U postgres -d support -c "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;" 
docker restart techweb-backend-1
echo "Done!"
