@echo off
setlocal
cd /d "%~dp0"
start "Google Sheets Setup Guide" "GOOGLE_SHEETS_SETUP.md"
start "Formula Pack" "assets/google_sheets/DASHBOARD_FORMULAS.md"
start "Import Folder" "assets/google_sheets"
echo Google Sheets setup files opened.

start "One-shot Import" "assets/google_sheets/IG_Content_Ops_import.xlsx"
