# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PAM - UFRGS (Página Auxiliar à Matrícula) is a static, client-only web app that helps UFRGS Ciência da Computação (CIC) and Engenharia de Computação (ECP) students build a conflict-free class schedule. There is no backend server: everything (schedule generation, curriculum tracking, user data) runs in the browser, with user data persisted only in `localStorage`. Class/section data ("turmas") is baked into a static JSON file at build time via a Python import pipeline.

## Repo layout

- `app-frontend/` — the Vue 3 + Vuetify SPA (see below). All frontend work happens here.
- `turmas_data/<semestre>/` — raw HTML pages saved from the UFRGS Portal do Aluno, one folder per semester (e.g. `26_2`). Processed HTMLs are moved into `turmas_data/<semestre>/imported/`.
- `gerar_csvs_portal.py` — the HTML parser: extracts sections/schedules/professors from a saved Portal do Aluno HTML page (`parse_html_portal`).
- `importar_turmas_data.py` — the importer: walks `turmas_data/`, calls into `gerar_csvs_portal.py`, diffs against what's already in `academic_data.json`, prints a change report, and writes the merged result back into `app-frontend/src/data/academic_data.json`. Distinguishes CIC vs ECP by filename (`cic*.html` vs `ecp*.html`).
- `importar_turmas.sh` — thin wrapper that just cd's to repo root and runs the importer.
- `deploy.sh` — `rsync`'s `app-frontend/dist/` to the `inf-site` remote host's `~/public_html/pam/`.

## Common commands

Frontend (run from `app-frontend/`):
```bash
npm install
npm run dev       # http://localhost:5173
npm run build      # outputs to app-frontend/dist/
npm run preview    # serve the production build locally
```

There is no configured lint or test command in `package.json` — none exists in this repo currently.

Data import (run from repo root, after dropping new Portal do Aluno HTMLs into `turmas_data/<semestre>/`):
```bash
./importar_turmas.sh
# or directly:
python3 importar_turmas_data.py
```
Add `--reimport_from_imported` to reprocess HTMLs already moved into `imported/` (useful for testing parser changes without new source files). This script mutates `app-frontend/src/data/academic_data.json` directly — treat it as a data migration, review the printed diff report before committing.

Deploy (manual, from repo root):
```bash
./deploy.sh
```

## Frontend architecture

Stack: Vue 3 (`<script setup>`), Vuetify 4, Vite, no router (page switching is done via a `currentPage` ref in `App.vue` and simple `v-if`/`v-else-if` blocks), no state management library (state lives in service singletons + `localStorage`).

**Data sources** (`src/data/`, both static JSON committed to the repo):
- `academic_data.json` — generated/maintained by the Python import pipeline. Shape: `{ courses: { cic: {...}, ecp: {...} }, turmas: { cic: [...], ecp: [...] }, curriculums: { cc, ec, cic, ecp }, last_updated, last_updated_by_curriculum }`. Course maps are keyed by course code; turmas are flat arrays of sections with `course_code`, `section_code`, `semester`, `capacity`, `capacity_by_curriculum`, `professor_name`, `ministrantes`, `schedules` (array of `{day_of_week, start_time, end_time, room}`), `curriculums`, `observacao`.
- `ufrgs_data.json` — CIC curriculum/prerequisite tree (`curriculum` array with `codigo`, `nome`, `etapa`, `creditos`, `pre_requisitos`, etc). ECP's curriculum is instead hardcoded as a JS array (`ecpSubjects`) directly inside `curriculumService.js`, since ECP isn't sourced from this JSON — keep that in mind if adding a third course.

**Services** (`src/services/`, plain object singletons, no classes/DI):
- `curriculumService.js` — owns the currently-selected course (`CIC`/`ECP`) as a shared Vue `ref` (`selectedCourseRef`) backed by `localStorage`, exposes curriculum/prerequisite data per course, and normalizes course-code aliases (`normalizeCurriculumCode`).
- `dataService.js` — the main data-access layer: reads `academic_data.json`, merges in any user-uploaded custom turmas, and is the single place that reads/writes all `localStorage` state (completed courses, desired courses, time restrictions, saved schedules, custom turmas). **All `localStorage` keys are scoped per-course** via `_getScopedKey`/`_getItemScoped`/`_setItemScoped` (suffixed with the course code) — when adding new persisted state, always go through those helpers rather than touching `localStorage` directly, or CIC/ECP data will bleed into each other. Also contains CSV/HTML turma parsers used by the "upload your own turmas" flow in `TurmasModal.vue` (mirrors, in JS, the same parsing `gerar_csvs_portal.py` does in Python — if the Portal do Aluno's HTML format changes, both need updating).
- `scheduleGeneratorService.js` — the schedule-generation engine. Pure functions, no I/O. `generateRankedSchedules` does a bounded backtracking search over section combinations per selected course (capped by `MAX_EVALS`/`MAX_COMBINATIONS`/a 1.5s time budget) filtering out hard time-blocks and conflicting sections, then scores/ranks surviving combinations by course priority, professor preference match, preferred-time-window match, and schedule compactness (fewer active days, fewer gaps). `diagnoseConflicts` is the counterpart used to explain *why* no schedule could be generated — it checks single-course infeasibility, then pairwise, then combinatorially up to size-6 subsets (each subset check itself calls `generateRankedSchedules` with `limit: 1`), all under its own time budget.
- `pdfParserService.js` — parses a student's official UFRGS transcript/history PDF (via `pdfjs-dist`) to auto-detect completed courses.
- `predictionService.js` — pure function (`generateGraduationPlan`) that projects a semester-by-semester "Previsão de Formatura" plan: greedily schedules subjects whose prerequisites and credit thresholds (`min_credits_required`, `min_elective_credits_required` — see gotcha below) are met, respecting a per-semester credit cap, and fills remaining slots with elective-credit placeholders (`ELETIVA-<credits>`). Subject availability/credit-threshold checks are delegated to `composables/useCurriculumStatus.js` (`calculateSubjectStatuses`), which is also used directly by `CurriculumCanvas.vue`.

**Components/pages** (`src/*.vue`, `src/components/*.vue`): `Home.vue` (landing), `GenerateSchedules.vue` (course selection + restrictions input), `GeneratedSchedule.vue` (results view, largest file), `SavedSchedules.vue`, `CurriculumCanvas.vue` (visual prerequisite flowchart), `SideBar.vue`, `TurmasModal.vue` (turma data source / custom upload), `ElectiveSuggestionsModal.vue`, `GraduationPlan.vue` (drives `predictionService` to build/edit the "Previsão de Formatura" plan, lets the user swap generated elective placeholders for real electives, and persists the plan via `dataService`). These are large, mostly self-contained single-file components — there's no shared component library beyond Vuetify.

## Working conventions

- User-facing strings, comments in the Python scripts, and commit-worthy prose in this repo are in Portuguese (pt-BR); keep new user-facing text consistent with that.
- Course codes `CIC`/`cic` (Ciência da Computação, aka `CC`/`cc`) and `ECP`/`ecp` (Engenharia de Computação, aka `EC`/`ec`) are used interchangeably across the codebase in both upper and lower case depending on context (JSON keys are lowercase, UI/logic constants are uppercase) — `curriculumService.normalizeCurriculumCode` is the canonical way to compare across these variants.
- When modifying `academic_data.json` by hand instead of through the importer, keep the `courses`/`turmas` per-curriculum split intact — several call sites fall back to legacy flat-list shapes for backward compatibility, so don't rely on that fallback path for new data.
- `min_elective_credits_required`/`min_credits_required` (used e.g. by ECP's `ECP99001`/`TG-I-ECP`, which officially require 30 elective + 150 mandatory credits — `curriculumService.js` caps the mandatory figure at 146 since the ECP curriculum only totals 148, see comment there) gate on credits *already banked*, not credits merely planned going forward. When generating or regenerating a plan in `GraduationPlan.vue`, always feed already-completed elective credits into `predictionService.generateGraduationPlan`'s `electiveCreditsAlreadyPlaced` (in addition to any plan-prefix electives) — otherwise courses gated by elective-credit thresholds unlock later than they should.
