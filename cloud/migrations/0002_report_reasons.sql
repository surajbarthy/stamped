-- Reports carry a reason. Private-info and harmful reports hide a post at
-- once; "other" reports hide it only at the REPORTS_TO_HIDE threshold, and
-- never once a moderator has cleared it.
ALTER TABLE stamps ADD COLUMN private_reports INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stamps ADD COLUMN harmful_reports INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stamps ADD COLUMN other_reports INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stamps ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0;
