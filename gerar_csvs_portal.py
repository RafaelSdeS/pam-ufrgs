#!/usr/bin/env python3
"""
gerar_csvs_portal.py

Script para extração e geração de arquivos CSV (turmas.csv e disciplinas.csv)
a partir das páginas HTML salvas do Portal do Aluno da UFRGS (Horário das Turmas).

Uso:
    python3 gerar_csvs_portal.py [arquivos_html...] [--saida_dir DIRETORIO]

Exemplo:
    python3 gerar_csvs_portal.py cic_26_2.html ecp_26_2.html --saida_dir test_csvs
"""

import os
import re
import csv
import sys
import argparse
from bs4 import BeautifulSoup

def parse_professors(raw_text):
    if not raw_text:
        return {
            'professor_name': 'Professor não definido',
            'ministrantes': [],
            'responsavel_conceito': ''
        }
    pattern = re.compile(
        r"([A-Za-zÀ-ÖØ-öø-ÿ\s.\-\x27]+?)\s*-\s*(Ministrante|Regente|Respons[a-zÀ-ÖØ-öø-ÿ]*)"
        r"(?:\s+de\s+\d{2}/\d{2}/\d{4}\s+a\s+\d{2}/\d{2}/\d{4})?"
        r"(?:\s*-\s*Respons[a-zÀ-ÖØ-öø-ÿ]*(?:\s+pelo)?(?:\s+conceito)?)?",
        re.IGNORECASE
    )
    ministrantes = []
    regentes = []
    responsavel = ""
    pos = 0
    while pos < len(raw_text):
        m = pattern.search(raw_text, pos)
        if not m:
            if not ministrantes and not regentes and not responsavel:
                clean = re.split(r"\s+-\s+(?:Ministrante|Regente|Respons)", raw_text, flags=re.IGNORECASE)[0].strip()
                if clean:
                    ministrantes = [clean]
                    responsavel = clean
            break
        name = m.group(1).strip()
        name = re.sub(r"^(?:-\s*|Respons[a-zÀ-ÖØ-öø-ÿ]*(?:\s+pelo)?(?:\s+conceito)?\s*)+", "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"^[-\s]+|[-\s]+$", "", name).strip()
        role = m.group(2).strip().lower()
        matched_text = m.group(0)
        is_resp_block = "respons" in role or re.search(r"-\s*respons", matched_text, re.IGNORECASE)
        if is_resp_block and not responsavel and name:
            responsavel = name
        if "ministrante" in role:
            if name and name not in ministrantes:
                ministrantes.append(name)
        elif "regente" in role:
            if name and name not in regentes:
                regentes.append(name)
        elif "respons" in role:
            if not responsavel and name:
                responsavel = name
        pos = m.end()
    if not ministrantes:
        if regentes:
            ministrantes = regentes
        elif responsavel:
            ministrantes = [responsavel]
    prof_display = ' e '.join(ministrantes) if ministrantes else (responsavel or 'Professor não definido')
    return {
        'professor_name': prof_display,
        'ministrantes': ministrantes,
        'responsavel_conceito': responsavel
    }


def formatar_horarios(text):
    if not text:
        return ""
    # Corrige junções comuns no HTML do portal
    # Ex: "Terça 10:30-12:10 2Sala 101 - Campus: ValeQuinta 10:30-12:10 2Sala 101"
    dias = ["Segunda", "Terça", "Tera", "Terca", "Quarta", "Quinta", "Sexta", "Sábado", "Sabado", "Sbado", "Domingo"]
    res = text.strip()
    for dia in dias:
        res = re.sub(rf'(?<!^)(?<!;\s)(?<!;\s\s)({dia}\s+\d{{1,2}}:\d{{2}})', r'; \1', res)
    # Limpa números extras na frente de Sala/Laboratório (ex: "2SALA DE AULA" -> "SALA DE AULA")
    res = re.sub(r'(?<=\d{2}:\d{2})\s*\d+([A-Za-zÀ-ÖØ-öø-ÿ])', r' \1', res)
    res = re.sub(r'\b\d+((?:SALA|Sala|LABORAT[OÓ]RIO|Laborat[oó]rio|AUDIT[OÓ]RIO|Audit[oó]rio|PR[EÉ]DIO|Pr[eé]dio)\b)', r'\1', res, flags=re.IGNORECASE)
    return res

def extrair_campus(sala_str):
    if not sala_str:
        return "Não Informado"
    m = re.search(r'Campus:\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)', sala_str, re.IGNORECASE)
    if m:
        c = m.group(1).strip()
        if "centro" in c.lower():
            return "Centro"
        if "vale" in c.lower():
            return "Vale"
        if "saude" in c.lower() or "saúde" in c.lower():
            return "Saúde"
        return c
    return "Não Informado"

def ler_arquivo_com_fallback(caminho):
    with open(caminho, 'rb') as f:
        content = f.read()
    try:
        texto = content.decode('utf-8')
        if '\ufffd' not in texto:
            return texto
    except UnicodeDecodeError:
        pass
    try:
        return content.decode('windows-1252')
    except UnicodeDecodeError:
        return content.decode('latin1', errors='replace')

def parse_html_portal(caminho_html, semestre_padrao="2026/2", curriculum=None):
    turmas = []
    disciplinas = {}

    if not curriculum:
        fname = os.path.basename(caminho_html).lower()
        if 'cic' in fname or 'cc' in fname:
            curriculum = 'CIC'
        elif 'ecp' in fname or 'eng' in fname:
            curriculum = 'ECP'
    else:
        if curriculum in ('cc', 'cic', 'CIC'):
            curriculum = 'CIC'
        elif curriculum in ('eng_comp', 'ecp', 'ec', 'ECP'):
            curriculum = 'ECP'

    conteudo_html = ler_arquivo_com_fallback(caminho_html)
    soup = BeautifulSoup(conteudo_html, 'html.parser')

    table = soup.find('table', class_='modelo1')
    if not table:
        print(f"[AVISO] Tabela com classe 'modelo1' não encontrada em {caminho_html}.")
        return turmas, disciplinas

    codigo_atual = None
    nome_atual = None
    creditos_atual = 4

    for tr in table.find_all('tr'):
        cols = [td.get_text(strip=True) for td in tr.find_all(['td', 'th'])]
        if len(cols) < 10:
            continue
        
        # Ignora cabeçalho
        if "Atividades de Ensino" in cols[0] or "Créditos" in cols[1]:
            continue

        texto_atividade = cols[0]
        if texto_atividade:
            match = re.search(r'\(([A-Z0-9]+)\)\s*(.*)', texto_atividade)
            if match:
                codigo_atual = match.group(1).strip()
                nome_atual = match.group(2).strip()
                nome_limpo = re.sub(r'\s+-\s+[A-Z0-9/]+$', '', nome_atual)
                try:
                    creditos_atual = int(cols[1]) if cols[1].isdigit() else 4
                except ValueError:
                    creditos_atual = 4

                if codigo_atual not in disciplinas:
                    disciplinas[codigo_atual] = {
                        'code': codigo_atual,
                        'name': nome_limpo if nome_limpo else nome_atual,
                        'credits': creditos_atual
                    }

        if not codigo_atual:
            continue

        turma_cod = cols[2].strip()
        if not turma_cod:
            continue

        try:
            vagas = int(cols[3]) if cols[3].isdigit() else 10
        except ValueError:
            vagas = 10

        horario_raw = cols[8]
        horarios = formatar_horarios(horario_raw)
        prof_info = parse_professors(cols[9])

        turmas.append({
            'course_code': codigo_atual,
            'section_code': turma_cod,
            'semester': semestre_padrao,
            'capacity': vagas,
            'curriculum': curriculum,
            'professor_name': prof_info['professor_name'],
            'ministrantes': prof_info['ministrantes'],
            'responsavel_conceito': prof_info['responsavel_conceito'],
            'schedules': horarios
        })

    return turmas, disciplinas

def main():
    parser = argparse.ArgumentParser(description="Parser HTML do Portal do Aluno UFRGS")
    parser.add_argument('htmls', nargs='*', default=['cic_26_2.html', 'ecp_26_2.html'], help="Arquivos HTML de entrada")
    parser.add_argument('--semestre', default='2026/2', help="Semestre a ser atribuído às turmas")

    args = parser.parse_args()

    todas_turmas = []
    todas_disciplinas = {}

    for html_path in args.htmls:
        if not os.path.exists(html_path):
            print(f"[AVISO] Arquivo HTML {html_path} não encontrado, ignorando...")
            continue
        print(f"Processando {html_path}...")
        t, d = parse_html_portal(html_path, semestre_padrao=args.semestre)
        print(f"  -> Extraídas {len(t)} turmas e {len(d)} disciplinas.")
        todas_turmas.extend(t)
        todas_disciplinas.update(d)

    print(f"\n[OK] Extraídas {len(todas_turmas)} turmas totais e {len(todas_disciplinas)} disciplinas.")

if __name__ == "__main__":
    main()
