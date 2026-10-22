# Inventaire des vues résolues — compte `admin`

Base `amg-erp-test` · 2026-10-22T22:32:12.610Z · menus : hr.menu_hr_root, hr_attendance.menu_hr_attendance_root

## Employés / Employés / Employés

Action 194 · modèle `hr.employee` · domaine `[('company_id', 'in', allowed_company_ids)]` · contexte `{'chat_icon': True}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 547 | 100 | 90 | 0 | 25 | 0/15 | 13 / 45 |
| list | 550 | 19 | 19 | 0 | 1 | 0/1 | 2 / 6 |
| search | 546 | 11 | 10 | 0 | 1 | 0/0 | 0 / 7 |

## Employés / Employés / Organigramme

Action 249 · modèle `hr.employee` · domaine `[]` · contexte `{'chat_icon': True}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 547 | 100 | 90 | 0 | 25 | 0/15 | 13 / 45 |
| list | 550 | 19 | 19 | 0 | 1 | 0/1 | 2 / 6 |
| search | 546 | 11 | 10 | 0 | 1 | 0/0 | 0 / 7 |

## Employés / Employés / Contrats

Action 219 · modèle `hr.contract` · domaine `[('employee_id', '!=', False)]` · contexte `{'search_default_group_by_state': 1}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 605 | 24 | 23 | 0 | 2 | 0/1 | 2 / 9 |
| list | 606 | 13 | 13 | 0 | 0 | 0/0 | 0 / 3 |
| search | 604 | 7 | 7 | 0 | 0 | 0/0 | 0 / 14 |

## Employés / Départements

Action 197 · modèle `hr.department` · domaine `[("has_read_access", "=", True)]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 554 | 12 | 10 | 0 | 4 | 0/2 | 2 / 8 |
| list | 555 | 6 | 6 | 0 | 0 | 0/0 | 0 / 1 |
| search | 556 | 2 | 2 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Analyse / Compétences

Action 255 · modèle `hr.employee.skill.report` · domaine `[]` · contexte `{
            'search_default_employee': 1,
            'search_default_employees_with_skills': 1,
        }`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | false | 11 | 11 | 0 | 0 | 0/0 | 0 / 0 |
| list | 717 | 5 | 5 | 0 | 0 | 0/0 | 0 / 1 |
| search | 718 | 4 | 4 | 0 | 0 | 0/0 | 0 / 4 |

## Employés / Analyse / Certifications

Action 375 · modèle `hr.resume.line` · domaine `[('display_type','=','certification')]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 697 | 8 | 8 | 0 | 0 | 0/0 | 1 / 2 |
| list | 1202 | 6 | 6 | 0 | 0 | 0/0 | 0 / 0 |
| search | 1203 | 3 | 3 | 0 | 0 | 0/0 | 0 / 5 |

## Employés / Configuration / Paramètres

Action 199 · modèle `res.config.settings` · domaine `[]` · contexte `{'module' : 'hr', 'bin_size': False}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 176 | 86 | 1 | 0 | 105 | 0/20 | 6 / 6 |
| list | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 1 |

## Employés / Configuration / Plan d'activité

Action 186 · modèle `mail.activity.plan` · domaine `[('res_model', '=', 'hr.employee'), '|', ('company_id', 'in', allowed_company_ids), ('company_id', '=', False)]` · contexte `{'default_res_model': 'hr.employee'}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 529 | 7 | 7 | 0 | 0 | 0/0 | 1 / 3 |
| list | 325 | 4 | 4 | 0 | 0 | 0/0 | 1 / 1 |
| search | 324 | 1 | 1 | 0 | 0 | 0/0 | 0 / 1 |

## Employés / Configuration / Employé / Lieux de travail

Action 198 · modèle `hr.work.location` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 559 | 5 | 5 | 0 | 0 | 0/0 | 0 / 1 |
| list | 558 | 3 | 3 | 0 | 0 | 0/0 | 0 / 1 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Configuration / Employé / Raisons du départ

Action 188 · modèle `hr.departure.reason` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 532 | 2 | 2 | 0 | 0 | 0/0 | 0 / 0 |
| list | 531 | 2 | 2 | 0 | 0 | 0/0 | 0 / 1 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Configuration / Employé / Types de compétences

Action 251 · modèle `hr.skill.type` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 710 | 6 | 6 | 0 | 0 | 0/0 | 2 / 6 |
| list | 709 | 4 | 4 | 0 | 0 | 0/0 | 2 / 5 |
| search | 708 | 4 | 4 | 0 | 0 | 0/0 | 0 / 1 |

## Employés / Configuration / Recrutement / Postes

Action 190 · modèle `hr.job` · domaine `[]` · contexte `{"search_default_Current":1}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 535 | 7 | 7 | 0 | 0 | 0/0 | 1 / 3 |
| list | 536 | 3 | 3 | 0 | 0 | 0/0 | 0 / 1 |
| search | 538 | 2 | 2 | 0 | 0 | 0/0 | 0 / 2 |

## Employés / Configuration / Recrutement / Types d'emploi

Action 189 · modèle `hr.contract.type` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 534 | 2 | 2 | 0 | 0 | 0/0 | 0 / 0 |
| list | 533 | 3 | 3 | 0 | 0 | 0/0 | 0 / 1 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Configuration / Contrats / Horaires de travail

Action 94 · modèle `resource.calendar` · domaine `['|', ('company_id', '=', False), ('company_id', 'in', allowed_company_ids)]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 252 | 12 | 10 | 0 | 7 | 0/5 | 1 / 10 |
| list | 253 | 3 | 3 | 0 | 0 | 0/0 | 0 / 0 |
| search | 251 | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Configuration / Défis / Badges

Action 287 · modèle `gamification.badge` · domaine `[]` · contexte `{}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 814 | 19 | 18 | 0 | 3 | 0/2 | 5 / 15 |
| list | 813 | 5 | 5 | 0 | 0 | 0/0 | 0 / 0 |
| search | 812 | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |

## Employés / Configuration / Défis / Défis

Action 369 · modèle `gamification.challenge` · domaine `[('challenge_category', '=', 'hr')]` · contexte `{'search_default_inprogress':True, 'default_inprogress':True}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 825 | 22 | 21 | 0 | 5 | 0/4 | 3 / 14 |
| list | 824 | 4 | 4 | 0 | 0 | 0/0 | 0 / 0 |
| search | 827 | 1 | 1 | 0 | 0 | 0/0 | 0 / 2 |

## Employés / Configuration / Défis / Historique des objectifs

Action 368 · modèle `gamification.goal` · domaine `[('challenge_id.challenge_category', '=', 'hr')]` · contexte `{'search_default_group_by_user': True, 'search_default_group_by_definition': True}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 818 | 12 | 12 | 0 | 4 | 0/4 | 0 / 7 |
| list | 817 | 9 | 9 | 0 | 0 | 0/0 | 0 / 1 |
| search | 819 | 3 | 3 | 0 | 0 | 0/0 | 0 / 6 |

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
| form | 764 | 4 | 4 | 0 | 1 | 0/1 | 0 / 1 |
| list | 1231 | 4 | 4 | 0 | 1 | 0/1 | 0 / 1 |
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

## Présences / Configuration

Action 214 · modèle `res.config.settings` · domaine `[]` · contexte `{'module' : 'hr_attendance', 'bin_size': False}`

| Vue | id | Champs XML | Importés | Exclus (droits) | Non pris en charge | Boutons (registre) | Diagnostics à traiter |
|---|---|---|---|---|---|---|---|
| form | 176 | 86 | 1 | 0 | 105 | 0/20 | 6 / 6 |
| list | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 0 |
| search | false | 1 | 1 | 0 | 0 | 0/0 | 0 / 1 |

## Expressions de condition non prises en charge (Q-08)

| Occurrences | Expression |
|---|---|
| 2 | `invisible="not context.get('chat_icon')"` |
| 1 | `column_invisible="context.get('default_res_model') != 'hr.employee'"` |
