-- SEC-01 : Stockage natif du jeton JWT RS256 signé dans la base SQLite locale.
-- La preuve cryptographique de licence est gérée par Rust et ne dépend plus
-- exclusivement du localStorage côté React.
ALTER TABLE licenses ADD COLUMN signed_token TEXT;
