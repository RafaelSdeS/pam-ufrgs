#!/usr/bin/env bash
#
# importar_turmas.sh
#
# Script Shell para atualizar os arquivos que regem as informações das turmas
# com base em turmas_data/, imprimindo as diferenças na tela e movendo os HTMLs
# para turmas_data/semestre/imported/filename_timestamp.html.
#
# Uso:
#   ./importar_turmas.sh [--turmas_data_dir DIRETORIO] [--json_path ARQUIVO_JSON]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

python3 importar_turmas_data.py "$@"
