#!/usr/bin/env python3
"""
importar_turmas_data.py

Script para atualizar o arquivo principal da aplicação (academic_data.json)
com base nos arquivos HTML do Portal do Aluno contidos em turmas_data/<semestre>/.

Para cada semestre encontrado:
1. Identifica arquivos .html novos na raiz ou re-importa da pasta imported/ (se solicitado).
2. Extrai separadamente as turmas para cada curso (Ciência da Computação vs Engenharia de Computação)
   com base no nome do arquivo HTML (ex: cic*.html vs ecp*.html) e armazena as vagas específicas
   para cada curso e a lista de cursos (curriculums) em que a turma é oferecida.
3. Compara com a importação anterior na base e imprime um relatório limpo na tela.
4. Atualiza diretamente app-frontend/src/data/academic_data.json sem gerar CSVs desnecessários.
5. Move novos arquivos HTML da raiz para turmas_data/<semestre>/imported/filename_timestamp.html.
"""

import os
import re
import sys
import json
import shutil
import argparse
from datetime import datetime

# Importa o parser oficial do projeto
try:
    from gerar_csvs_portal import parse_html_portal
except ImportError:
    print("[ERRO] Não foi possível importar gerar_csvs_portal. Certifique-se de estar no diretório raiz do projeto.")
    sys.exit(1)


def parse_semestre_dir_name(dir_name):
    """
    Converte o nome da pasta do semestre (ex: '26_2' ou '2026_2' ou '2026-2') no formato 'YYYY/S' (ex: '2026/2').
    """
    m = re.match(r'^(\d{2})_([12])$', dir_name)
    if m:
        return f"20{m.group(1)}/{m.group(2)}"
    m = re.match(r'^(\d{4})[_-]([12])$', dir_name)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    if re.match(r'^\d{4}/\d$', dir_name):
        return dir_name
    return dir_name


def extrair_situacao_em(caminho_html):
    """
    Extrai o timestamp 'Situação em DD/MM/YY(YY) - HH:MM' do arquivo HTML do portal.
    """
    try:
        from gerar_csvs_portal import ler_arquivo_com_fallback
        conteudo = ler_arquivo_com_fallback(caminho_html)
    except Exception:
        with open(caminho_html, 'rb') as f:
            raw = f.read()
        try:
            conteudo = raw.decode('utf-8')
        except UnicodeDecodeError:
            try:
                conteudo = raw.decode('windows-1252')
            except UnicodeDecodeError:
                conteudo = raw.decode('latin1', errors='replace')
    
    m = re.search(r'Situa\w*\s+em\s+([0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}\s*(?:-\s*|às\s*|as\s*|\s+)[0-9]{1,2}:[0-9]{2})', conteudo, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def converter_horario_para_lista(horario_str):
    """
    Converte a string de horários extraída no formato oficial em uma lista de objetos estruturados.
    """
    if not horario_str:
        return []
    schedules = []
    chunks = [c.strip() for c in re.split(r';', horario_str) if c.strip()]
    pattern = re.compile(
        r'^(Segunda|Terça|Tera|Terca|Quarta|Quinta|Sexta|Sábado|Sabado|Sbado|Domingo)[a-z-]*\s+(?:das\s+)?(\d{1,2}:\d{2})\s*(?:-|as|às|a)\s*(\d{1,2}:\d{2})\s*(.*)$',
        re.IGNORECASE
    )
    dias_map = {
        'segunda': 'Segunda-feira',
        'terça': 'Terça-feira',
        'tera': 'Terça-feira',
        'terca': 'Terça-feira',
        'quarta': 'Quarta-feira',
        'quinta': 'Quinta-feira',
        'sexta': 'Sexta-feira',
        'sábado': 'Sábado',
        'sabado': 'Sábado',
        'sbado': 'Sábado',
        'domingo': 'Domingo'
    }
    for chunk in chunks:
        m = pattern.match(chunk)
        if m:
            day_raw = m.group(1).lower()
            day_norm = dias_map.get(day_raw, m.group(1).capitalize() + '-feira')
            start_t = m.group(2)
            end_t = m.group(3)
            room = m.group(4).strip()
            room = re.sub(r'^[-\s(]+|[)\s]+$', '', room)
            m_obs_room = re.search(r'Observa[çc][ãa]o(?:es)?:\s*(.*)', room, re.IGNORECASE | re.DOTALL)
            if m_obs_room:
                room = room[:m_obs_room.start()].strip()
            if room in ['2', '4'] or room.isdigit():
                room = ''

            def pad_time(t):
                parts = t.split(':')
                return f"{int(parts[0]):02d}:{int(parts[1]):02d}:00" if len(parts) == 2 else t

            schedules.append({
                'day_of_week': day_norm,
                'start_time': pad_time(start_t),
                'end_time': pad_time(end_t),
                'room': room
            })
    return schedules


def format_sched_list_for_diff(sched_list):
    if not sched_list:
        return "Sem horários definidos"
    parts = []
    for s in sched_list:
        day = s.get('day_of_week', '')
        start = s.get('start_time', '')[:5]
        end = s.get('end_time', '')[:5]
        room = s.get('room', '')
        parts.append(f"{day} {start}-{end}" + (f" ({room})" if room else ""))
    return "; ".join(parts)


def determinar_curriculos_para_disciplina(course_code, data_json):
    """
    Determina a lista de currículos a que a disciplina pertence como fallback para HTMLs genéricos.
    """
    curriculos = []
    for curr_key, curr_data in data_json.get('curriculums', {}).items():
        for course in curr_data.get('courses', []):
            if course.get('code') == course_code:
                norm_curr = 'CIC' if curr_key in ('cc', 'cic', 'CIC') else ('ECP' if curr_key in ('ec', 'ecp', 'eng_comp', 'ECP') else curr_key.upper())
                if norm_curr not in curriculos:
                    curriculos.append(norm_curr)
                break
    return sorted(curriculos) if curriculos else ['CIC', 'ECP']


def main():
    parser = argparse.ArgumentParser(description="Atualizador e importador de turmas HTML a partir de turmas_data/")
    parser.add_argument('--turmas_data_dir', default='turmas_data', help="Diretório contendo as pastas de semestres")
    parser.add_argument('--json_path', default='app-frontend/src/data/academic_data.json', help="Caminho do academic_data.json")
    parser.add_argument('--reimport_from_imported', action='store_true', help="Se não houver HTMLs novos na raiz, re-processa os HTMLs contidos em imported/")
    args = parser.parse_args()

    if not os.path.exists(args.turmas_data_dir):
        print(f"[ERRO] Diretório {args.turmas_data_dir} não encontrado.")
        sys.exit(1)

    if not os.path.exists(args.json_path):
        print(f"[ERRO] Arquivo JSON {args.json_path} não encontrado.")
        sys.exit(1)

    with open(args.json_path, 'r', encoding='utf-8') as f:
        data_json = json.load(f)

    turmas_atuais_map = {(t['course_code'], t['section_code']): t for t in data_json.get('turmas', [])}

    semestre_dirs = [
        d for d in os.listdir(args.turmas_data_dir)
        if os.path.isdir(os.path.join(args.turmas_data_dir, d))
    ]

    if not semestre_dirs:
        print(f"[AVISO] Nenhuma pasta de semestre encontrada dentro de {args.turmas_data_dir}.")
        return

    teve_alteracoes_global = False

    for sem_dir_name in sorted(semestre_dirs):
        sem_path = os.path.join(args.turmas_data_dir, sem_dir_name)
        semestre_str = parse_semestre_dir_name(sem_dir_name)

        # HTMLs na raiz da pasta do semestre
        html_files = [
            os.path.join(sem_path, f) for f in sorted(os.listdir(sem_path))
            if f.lower().endswith('.html') and os.path.isfile(os.path.join(sem_path, f))
        ]
        is_reimporting = False

        # Se não há na raiz e foi solicitado re-importar de imported/
        if not html_files and args.reimport_from_imported:
            imported_dir = os.path.join(sem_path, 'imported')
            if os.path.exists(imported_dir):
                html_files = [
                    os.path.join(imported_dir, f) for f in sorted(os.listdir(imported_dir))
                    if f.lower().endswith('.html') and os.path.isfile(os.path.join(imported_dir, f))
                ]
                if html_files:
                    is_reimporting = True

        if not html_files:
            print(f"[INFO] Semestre {semestre_str} ({sem_dir_name}): Nenhum arquivo HTML novo na raiz para importar.")
            continue

        print(f"\n=====================================================================")
        print(f"=== PROCESSANDO IMPORTAÇÃO: SEMESTRE {semestre_str} ({sem_dir_name}) ===")
        print(f"=====================================================================")
        print(f"Arquivos HTML ('{'reimportando de imported/' if is_reimporting else 'raiz'}'): {', '.join(os.path.basename(f) for f in html_files)}\n")

        novas_turmas_por_chave = {}
        novas_disciplinas_map = {}
        situacao_por_curriculo = data_json.get('last_updated_by_curriculum', {})
        if not isinstance(situacao_por_curriculo, dict):
            situacao_por_curriculo = {}

        for h_file in html_files:
            print(f"  -> Extraindo dados de: {h_file} ...")
            situacao_str = extrair_situacao_em(h_file)
            if situacao_str:
                fname_lower = os.path.basename(h_file).lower()
                if 'cic' in fname_lower or 'cc' in fname_lower:
                    situacao_por_curriculo['CIC'] = situacao_str
                elif 'ecp' in fname_lower or 'eng' in fname_lower:
                    situacao_por_curriculo['ECP'] = situacao_str
                else:
                    situacao_por_curriculo['GERAL'] = situacao_str
                print(f"     [TIMESTAMP] Situação em: {situacao_str}")

            t_list, d_map = parse_html_portal(h_file, semestre_padrao=semestre_str)
            novas_disciplinas_map.update(d_map)

            for t in t_list:
                chave = (t['course_code'], t['section_code'])
                if chave not in novas_turmas_por_chave:
                    novas_turmas_por_chave[chave] = {
                        'course_code': t['course_code'],
                        'section_code': t['section_code'],
                        'semester': t['semester'],
                        'capacity': int(t['capacity']),
                        'capacity_by_curriculum': {},
                        'professor_name': t['professor_name'],
                        'ministrantes': t['ministrantes'],
                        'responsavel_conceito': t['responsavel_conceito'],
                        'observacao': t.get('observacao', ''),
                        'schedules': t['schedules'],
                        'curriculums_set': set()
                    }

                curr = t.get('curriculum')
                if curr:
                    novas_turmas_por_chave[chave]['curriculums_set'].add(curr)
                    novas_turmas_por_chave[chave]['capacity_by_curriculum'][curr] = int(t['capacity'])
                else:
                    # Fallback para HTML sem identificação clara de curso no nome
                    currs_fb = determinar_curriculos_para_disciplina(t['course_code'], data_json)
                    novas_turmas_por_chave[chave]['curriculums_set'].update(currs_fb)
                    for c_fb in currs_fb:
                        novas_turmas_por_chave[chave]['capacity_by_curriculum'][c_fb] = int(t['capacity'])

                if int(t['capacity']) > novas_turmas_por_chave[chave]['capacity']:
                    novas_turmas_por_chave[chave]['capacity'] = int(t['capacity'])
                if len(t['schedules']) > len(novas_turmas_por_chave[chave]['schedules']) or (
                    novas_turmas_por_chave[chave]['professor_name'] == 'Professor não definido' and t['professor_name'] != 'Professor não definido'
                ):
                    novas_turmas_por_chave[chave]['schedules'] = t['schedules']
                    novas_turmas_por_chave[chave]['professor_name'] = t['professor_name']
                    novas_turmas_por_chave[chave]['ministrantes'] = t['ministrantes']
                    novas_turmas_por_chave[chave]['responsavel_conceito'] = t['responsavel_conceito']
                    if t.get('observacao'):
                        novas_turmas_por_chave[chave]['observacao'] = t.get('observacao')
                elif t['ministrantes'] and set(t['ministrantes']) != set(novas_turmas_por_chave[chave]['ministrantes']):
                    comb = []
                    for m in novas_turmas_por_chave[chave]['ministrantes'] + t['ministrantes']:
                        if m not in comb:
                            comb.append(m)
                    novas_turmas_por_chave[chave]['ministrantes'] = comb
                    novas_turmas_por_chave[chave]['professor_name'] = ' e '.join(comb)
                if not novas_turmas_por_chave[chave]['responsavel_conceito'] and t['responsavel_conceito']:
                    novas_turmas_por_chave[chave]['responsavel_conceito'] = t['responsavel_conceito']
                if not novas_turmas_por_chave[chave]['observacao'] and t.get('observacao'):
                    novas_turmas_por_chave[chave]['observacao'] = t.get('observacao')

        turmas_anteriores_do_semestre = {
            (t['course_code'], t['section_code']): t
            for t in data_json.get('turmas', [])
            if t.get('semester') == semestre_str
        }

        adicionadas = []
        removidas = []
        alteradas = []
        inalteradas = 0

        for chave, nova_t in sorted(novas_turmas_por_chave.items()):
            cc, sc = chave
            curr_list_sorted = sorted(list(nova_t['curriculums_set'])) if nova_t['curriculums_set'] else ['CIC', 'ECP']
            nova_t['curriculums'] = [
                'CIC' if c in ('cc', 'cic', 'CIC') else ('ECP' if c in ('eng_comp', 'ecp', 'ec', 'ECP') else c.upper())
                for c in curr_list_sorted
            ]
            nova_t['curriculums'] = sorted(list(set(nova_t['curriculums'])))

            norm_cap_map = {}
            for k, v in nova_t['capacity_by_curriculum'].items():
                norm_k = 'CIC' if k in ('cc', 'cic', 'CIC') else ('ECP' if k in ('eng_comp', 'ecp', 'ec', 'ECP') else k.upper())
                norm_cap_map[norm_k] = v
            nova_t['capacity_by_curriculum'] = norm_cap_map

            if chave not in turmas_anteriores_do_semestre:
                adicionadas.append((chave, nova_t))
            else:
                ant_t = turmas_anteriores_do_semestre[chave]
                diffs = []
                
                # 1. Cursos/Curriculums atendidos
                ant_currs = sorted(ant_t.get('curriculums', []))
                if ant_currs != curr_list_sorted:
                    diffs.append(('curriculums', f"Cursos atendidos: {ant_currs} -> {curr_list_sorted}"))

                # 2. Vagas por currículo
                ant_cap_map = ant_t.get('capacity_by_curriculum', {})
                if ant_cap_map != nova_t['capacity_by_curriculum']:
                    diffs.append(('capacity_by_curriculum', f"Vagas específicas (Veteranos): {ant_cap_map} -> {nova_t['capacity_by_curriculum']}"))
                elif int(ant_t.get('capacity', 0)) != nova_t['capacity']:
                    diffs.append(('capacity', f"Vagas máximas: {ant_t.get('capacity')} -> {nova_t['capacity']}"))

                # 3. Professor
                prof_ant = ant_t.get('professor_name', '').strip()
                prof_novo = nova_t.get('professor_name', '').strip()
                if prof_ant != prof_novo:
                    diffs.append(('professor_name', f"Professor: '{prof_ant}' -> '{prof_novo}'"))

                # 4. Horários/Salas
                sched_ant_str = format_sched_list_for_diff(ant_t.get('schedules', []))
                sched_novo_list = converter_horario_para_lista(nova_t.get('schedules', ''))
                sched_novo_str = format_sched_list_for_diff(sched_novo_list)
                if sched_ant_str != sched_novo_str:
                    diffs.append(('schedules', f"Horários/Salas:\n      Anterior: {sched_ant_str}\n      Novo:     {sched_novo_str}"))

                # 5. Observação
                obs_ant = ant_t.get('observacao', '').strip()
                obs_novo = nova_t.get('observacao', '').strip()
                if obs_ant != obs_novo:
                    diffs.append(('observacao', f"Observação: '{obs_ant}' -> '{obs_novo}'"))

                if diffs:
                    alteradas.append((chave, ant_t, nova_t, diffs))
                else:
                    inalteradas += 1

        for chave, ant_t in sorted(turmas_anteriores_do_semestre.items()):
            if chave not in novas_turmas_por_chave:
                removidas.append((chave, ant_t))

        print(f"\n--- RELATÓRIO DE DIFERENÇAS ({semestre_str}) ---")
        if not adicionadas and not removidas and not alteradas:
            print("  [✓] Nenhuma diferença encontrada em relação à importação anterior. Dados estão atualizados e idênticos.")
        else:
            if adicionadas:
                print(f"\n[+] TURMAS ADICIONADAS ({len(adicionadas)}):")
                for (cc, sc), t in adicionadas:
                    prof = t.get('professor_name', 'Não definido')
                    sched_str = format_sched_list_for_diff(converter_horario_para_lista(t.get('schedules', '')))
                    print(f"  + {cc} Turma {sc} (Cursos: {t['curriculums']}, Vagas: {t['capacity_by_curriculum']}, Prof: {prof})")
                    print(f"    Horários: {sched_str}")

            if alteradas:
                print(f"\n[*] TURMAS ALTERADAS ({len(alteradas)}):")
                for (cc, sc), ant_t, nova_t, diffs in alteradas:
                    nome_disc = ant_t.get('course_name') or novas_disciplinas_map.get(cc, {}).get('name', cc)
                    print(f"  * {cc} ({nome_disc}) - Turma {sc}:")
                    for _, msg in diffs:
                        print(f"    - {msg}")

            if removidas:
                print(f"\n[-] TURMAS REMOVIDAS ({len(removidas)}):")
                for (cc, sc), t in removidas:
                    nome_disc = t.get('course_name', cc)
                    print(f"  - {cc} ({nome_disc}) - Turma {sc}")

            teve_alteracoes_global = True

        print(f"\nResumo {semestre_str}: {len(adicionadas)} adicionadas | {len(alteradas)} alteradas | {len(removidas)} removidas | {inalteradas} sem mudanças")

        # Atualização do academic_data.json
        print("\nAtualizando estrutura do academic_data.json...")
        outras_turmas = [
            t for t in data_json.get('turmas', [])
            if t.get('semester') != semestre_str
        ]

        novas_turmas_json_list = []
        for (cc, sc), t in sorted(novas_turmas_por_chave.items()):
            ant_t = turmas_atuais_map.get((cc, sc), {})
            course_name = ant_t.get('course_name') or novas_disciplinas_map.get(cc, {}).get('name') or data_json.get('courses', {}).get(cc, {}).get('name', cc)
            schedules_list = converter_horario_para_lista(t['schedules'])

            turma_dict = {
                'course_code': cc,
                'section_code': sc,
                'semester': semestre_str,
                'capacity': t['capacity'],
                'capacity_by_curriculum': t['capacity_by_curriculum'],
                'professor_name': t.get('professor_name', 'Professor não definido'),
                'ministrantes': t.get('ministrantes', []),
                'responsavel_conceito': t.get('responsavel_conceito', ''),
                'observacao': t.get('observacao', ''),
                'schedules': schedules_list,
                'curriculums': t['curriculums'],
                'course_name': course_name
            }
            novas_turmas_json_list.append(turma_dict)

        data_json['turmas'] = sorted(outras_turmas + novas_turmas_json_list, key=lambda x: (x['course_code'], x['section_code']))

        if 'courses' not in data_json:
            data_json['courses'] = {}
        for cc, disc_info in novas_disciplinas_map.items():
            if cc not in data_json['courses']:
                data_json['courses'][cc] = {
                    'code': cc,
                    'name': disc_info['name'],
                    'credits': disc_info['credits']
                }

        if situacao_por_curriculo:
            data_json['last_updated_by_curriculum'] = situacao_por_curriculo
            data_json['last_updated'] = situacao_por_curriculo.get('CIC') or situacao_por_curriculo.get('ECP') or situacao_por_curriculo.get('GERAL') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        else:
            data_json['last_updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with open(args.json_path, 'w', encoding='utf-8') as f:
            json.dump(data_json, f, ensure_ascii=False, indent=2)
        print(f"  [OK] Arquivo oficial atualizado: {args.json_path}")

        # Se os HTMLs estavam na raiz (não re-importação), move para imported/
        if not is_reimporting:
            imported_dir = os.path.join(sem_path, 'imported')
            os.makedirs(imported_dir, exist_ok=True)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            print("\nMovendo arquivos HTML para a pasta imported/...")
            for h_file in html_files:
                base_name, ext = os.path.splitext(os.path.basename(h_file))
                dest_name = f"{base_name}_{timestamp}{ext}"
                dest_path = os.path.join(imported_dir, dest_name)
                shutil.move(h_file, dest_path)
                print(f"  [MOVIDO] {os.path.basename(h_file)} -> {dest_path}")

    if not teve_alteracoes_global:
        print("\nConcluído. Processamento finalizado sem mudanças estruturais na base de dados.")
    else:
        print("\nConcluído. A base de turmas do sistema foi reestruturada com separação de cursos e vagas por currículo.")


if __name__ == '__main__':
    main()
