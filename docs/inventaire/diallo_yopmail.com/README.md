# Inventaire des vues résolues — compte `diallo@yopmail.com`

Base `amg-erp-test` · 2026-10-22T22:57:13.627Z · menus : hr.menu_hr_root, hr_attendance.menu_hr_attendance_root

## Employés / Annuaire

Action 192 · modèle `hr.employee.public` · domaine `[('company_id', 'in', allowed_company_ids)]` · contexte `{'chat_icon': True}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 542 | 31 | 30 | 0 | 3 | 0/2 | 6 / 21 |
| list | 543 | 7 | 7 | 0 | 0 | 0/0 | 0 / 0 |
| search | 541 | 6 | 5 | 0 | 1 | 0/0 | 0 / 4 |

## Employés / Contrats

Action 219 · modèle `hr.contract` · domaine `[('employee_id', '!=', False)]` · contexte `{'search_default_group_by_state': 1}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 605 | 23 | 22 | 0 | 2 | 0/1 | 0 / 7 |
| list | 606 | 13 | 13 | 0 | 0 | 0/0 | 0 / 3 |
| search | 604 | 7 | 7 | 0 | 0 | 0/0 | 0 / 14 |

## Présences / Aperçu

Action 206 · modèle `hr.attendance` · domaine `[]` · contexte `
            {
                "search_default_groupby_name": 1,
                "search_default_employee": 2
            }
        `

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 573 | 29 | 29 | 0 | 2 | 2/4 | 1 / 10 |
| list | 571 | 27 | 27 | 0 | 2 | 0/2 | 0 / 2 |
| search | 576 | 3 | 3 | 0 | 0 | 0/0 | 0 / 8 |

## Présences / Gestion

Action 208 · modèle `hr.attendance` · domaine `[('check_out', '!=', False)]` · contexte `{'search_default_with_worked_hours': 1}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 573 | 29 | 29 | 0 | 2 | 2/4 | 1 / 10 |
| list | 578 | 10 | 10 | 0 | 5 | 0/5 | 0 / 5 |
| search | 577 | 2 | 2 | 0 | 0 | 0/0 | 0 / 1 |

## Présences / Synthèse

Action 266 · modèle `hr.attendance.ventilation` · domaine `[]` · contexte `
      {"group_by":["parent_id","department_id","employee_id","closure_id","week_label","day_of_week"],
      "group_show_count":False,
      "search_default_hs_approved":1,
      "orderby": "closure_start asc" 
      }
    `

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | false | 41 | 41 | 0 | 0 | 0/0 | 0 / 0 |
| list | 758 | 23 | 23 | 0 | 0 | 0/0 | 0 / 0 |
| search | 759 | 3 | 3 | 0 | 0 | 0/0 | 0 / 1 |

## Présences / Calendrier de clotures des Pointages

Action 267 · modèle `hr.attendance.closure` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 764 | 4 | 4 | 0 | 0 | 0/0 | 0 / 0 |
| list | 1231 | 4 | 4 | 0 | 0 | 0/0 | 0 / 1 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Présences / Analyse

Action 207 · modèle `hr.attendance` · domaine `[]` · contexte `
            {
                "search_default_employee": 2,
                "search_default_activeemployees": 1,
                "search_default_last_three_months": 1
            }
        `

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 573 | 29 | 29 | 0 | 2 | 2/4 | 1 / 10 |
| list | 571 | 27 | 27 | 0 | 2 | 0/2 | 0 / 2 |
| search | 576 | 3 | 3 | 0 | 0 | 0/0 | 0 / 8 |

## Expressions de condition non prises en charge (Q-08)

| Occurrences | Expression |
|---|---|
| 1 | `invisible="not context.get('chat_icon')"` |
