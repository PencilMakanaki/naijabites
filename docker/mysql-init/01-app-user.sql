-- Development only. Creates the app's limited user (data changes, no structure changes).
CREATE USER IF NOT EXISTS 'naijabites_app'@'%' IDENTIFIED BY 'app_dev_only_change_me';
GRANT SELECT, INSERT, UPDATE, DELETE ON naijabites.* TO 'naijabites_app'@'%';
FLUSH PRIVILEGES;
