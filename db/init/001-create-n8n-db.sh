#!/bin/sh
# Runs once, on first init of an empty pgdata volume (postgres image convention).
# n8n gets its own database so its ~25 internal tables never mix with our
# application schema (sources, posts, news_items, ...) living in $POSTGRES_DB.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE n8n OWNER $POSTGRES_USER;
EOSQL
