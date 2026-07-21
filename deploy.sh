#!/bin/sh
rsync -avzh --delete ./app-frontend/dist/ inf-site:~/public_html/pam/
