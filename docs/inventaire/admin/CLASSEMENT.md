# Classement des manques — compte `admin`

69 vues, 19 modèles. Généré par `npm run classement` (hors ligne, depuis les fichiers de l'inventaire).

Lecture : un manque se traite **une fois** dans le moteur et disparaît de toutes les vues concernées.
« Transversal » = présent sur plusieurs modèles (à implémenter en priorité) ; « propre à » = un seul modèle
(souvent un widget spécifique d'Odoo : candidat à un lien « Ouvrir dans Odoo »).

## Synthèse

| Famille | Manques distincts | Transversaux | Occurrences |
|---|---|---|---|
| Types de champ | 3 | 1 | 14 |
| Widgets | 21 | 2 | 35 |
| Éléments de vue | 10 | 6 | 85 |
| Recherche | 3 | 3 | 28 |
| Boutons | 2 | 1 | 58 |
| Expressions | 1 | 1 | 4 |

## Types de champ

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| html | Attention | 5 | 6 | transversal (5 modèles) | gamification.badge.form, hr.contract.form, hr.employee.form, hr.job.form, … (+1) |
| binary | Attention | 1 | 6 | propre à `hr.employee` | hr.employee.form |
| properties | Attention | 1 | 2 | propre à `hr.employee` | hr.employee.form |

## Widgets

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| color_picker | Info | 4 | 4 | transversal (2 modèles) | hr.department.form, hr.department.list, hr.skill.type.form, hr.skill.type.list |
| handle | Info | 3 | 3 | transversal (3 modèles) | hr.contract.type.list, hr.departure.reason.list, hr.job.list |
| hr_homeworking_radio_image | Info | 2 | 2 | propre à `hr.work.location` | hr.work.location.form, hr.work.location.list |
| state_selection | Info | 2 | 2 | propre à `hr.contract` | hr.contract.form, hr.contract.list |
| hr_org_chart | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| hr_presence_status | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| list_activity | Info | 1 | 2 | propre à `hr.employee` | hr.employee.list |
| remaining_days | Info | 1 | 2 | propre à `hr.employee` | hr.employee.list |
| resume_one2many | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| skills_one2many | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| work_permit_upload | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| auto_save_skill_type | Info | 1 | 1 | propre à `hr.skill.type` | hr.skill.type.form |
| daterange | Info | 1 | 1 | propre à `hr.resume.line` | hr.resume.line.form |
| domain | Info | 1 | 1 | propre à `gamification.challenge` | gamification.challenge.form |
| many2many_tags_skills | Info | 1 | 1 | propre à `hr.skill.type` | hr.skill.type.list |
| monetary | Info | 1 | 1 | propre à `hr.contract` | hr.contract.list |
| percentage | Info | 1 | 1 | propre à `hr.employee.skill.report` | hr.employee.skill.report.list |
| progressbar | Info | 1 | 1 | propre à `gamification.goal` | gamification.goal.list |
| section_one2many | Info | 1 | 1 | propre à `resource.calendar` | resource.calendar.form |
| timezone_mismatch | Info | 1 | 1 | propre à `resource.calendar` | resource.calendar.form |
| work_entry_source_field | Info | 1 | 1 | propre à `hr.contract` | hr.contract.form |

## Éléments de vue

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Texte libre de la vue non importé. | Info | 9 | 33 | transversal (9 modèles) | gamification.badge.form, gamification.challenge.form, gamification.goal.form, hr.attendance.form, … (+5) |
| Élément visuel « web_ribbon » non pris en charge. | Info | 8 | 9 | transversal (8 modèles) | gamification.badge.form, hr.contract.form, hr.department.form, hr.employee.form, … (+4) |
| « chatter » non pris en charge. | Attention | 5 | 8 | transversal (5 modèles) | gamification.challenge.form, hr.attendance.form, hr.contract.form, hr.department.form, … (+1) |
| Sous-vue de relation non tabulaire : affichée en liste de noms. | Info | 4 | 9 | transversal (4 modèles) | gamification.challenge.form, hr.employee.form, hr.skill.type.form, mail.activity.plan.form |
| « header » de liste non pris en charge. | Info | 3 | 6 | transversal (3 modèles) | hr.attendance.closure.list, hr.attendance.list, hr.employee.list |
| Élément visuel « contract_warning_tooltip » non pris en charge. | Info | 2 | 3 | transversal (2 modèles) | hr.contract.form, hr.employee.form |
| « app » non pris en charge. | Attention | 1 | 12 | propre à `res.config.settings` | res.config.settings.form |
| « searchpanel » de recherche non pris en charge. | Info | 1 | 2 | propre à `hr.employee` | hr.employee.search |
| Élément visuel « hr_employee_chat » non pris en charge. | Info | 1 | 2 | propre à `hr.employee` | hr.employee.form |
| Élément visuel « hr_department_chart » non pris en charge. | Info | 1 | 1 | propre à `hr.department` | hr.department.form |

## Recherche

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Filtre non pris en charge : désactivé. | Info | 5 | 13 | transversal (5 modèles) | gamification.goal.search, hr.attendance.search, hr.attendance.ventilation.search, hr.contract.search, … (+1) |
| Recherche sur ce champ non prise en charge : désactivée. | Info | 5 | 9 | transversal (5 modèles) | hr.attendance.search, hr.contract.search, hr.employee.search, hr.skill.type.search, … (+1) |
| Regroupement non pris en charge. | Info | 2 | 6 | transversal (2 modèles) | hr.attendance.search, hr.employee.search |

## Boutons

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Bouton hors du registre de commandes : affiché désactivé. | Info | 9 | 55 | transversal (9 modèles) | gamification.badge.form, gamification.challenge.form, gamification.goal.form, hr.attendance.closure.form, … (+5) |
| Bouton de liste non pris en charge. | Info | 1 | 3 | propre à `hr.attendance` | hr.attendance.list |

## Expressions

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Décoration de cellule ignorée : style neutre. | Info | 2 | 4 | transversal (2 modèles) | hr.attendance.list, hr.contract.list |

## Boutons candidats au registre de commandes

Le registre est fermé (ADR-001) : chaque bouton retenu demande une commande Leila explicite, testée avec les droits.

| Modèle | Bouton | Type | Libellé | Vues |
|---|---|---|---|---|
| `gamification.badge` | `282` | action | Délivrer ce badge | form |
| `gamification.badge` | `get_granted_employees` | object | — | form |
| `gamification.challenge` | `289` | action | — | form |
| `gamification.challenge` | `action_check` | object | Rafraîchir le défi | form |
| `gamification.challenge` | `action_start` | object | Démarrer le défi | form |
| `gamification.challenge` | `action_view_users` | object | — | form |
| `gamification.goal` | `action_fail` | object | Objectif non atteint | form |
| `gamification.goal` | `action_reach` | object | Objectif atteint | form |
| `gamification.goal` | `action_start` | object | Démarrer l'objectif | form |
| `gamification.goal` | `update_goal` | object | rafraîchir | form |
| `hr.attendance` | `action_in_attendance_maps` | object | Voir dans Maps | form |
| `hr.attendance` | `action_open_attendance_form` | object | — | list |
| `hr.attendance` | `action_out_attendance_maps` | object | Voir dans Maps | form |
| `hr.attendance.closure` | `action_rebuild_all_ventilations` | object | Régénérer TOUTES les ventilations | list |
| `hr.attendance.closure` | `action_rebuild_month_ventilations` | object | Régénérer ventilations + HS | form |
| `hr.contract` | `action_open_contract_list` | object | — | form |
| `hr.department` | `action_employee_from_department` | object | — | form |
| `hr.department` | `action_plan_from_department` | object | — | form |
| `hr.employee` | `187` | action | Plan de lancement | form, list |
| `hr.employee` | `193` | action | Imprimer le badge | form |
| `hr.employee` | `249` | action | — | form |
| `hr.employee` | `263` | action | Déduire des heures supplémentaires | form |
| `hr.employee` | `367` | action | Attribuer un badge | form |
| `hr.employee` | `387` | action | Accès portail | form |
| `hr.employee` | `action_create_user` | object | Créer un utilisateur | form |
| `hr.employee` | `action_open_contract` | object | — | form |
| `hr.employee` | `action_open_last_month_attendances` | object | — | form |
| `hr.employee` | `action_open_last_month_overtime` | object | — | form |
| `hr.employee` | `action_open_work_entries` | object | — | form |
| `hr.employee` | `action_related_contacts` | object | — | form |
| `hr.employee` | `action_time_off_dashboard` | object | — | form |
| `hr.employee` | `generate_random_barcode` | object | Générer | form |
| `res.config.settings` | `103` | action | Serveurs de messagerie entrants | form |
| `res.config.settings` | `112` | action | Serveurs ICE | form |
| `res.config.settings` | `120` | action | Types d'activités | form |
| `res.config.settings` | `18` | action | Serveurs de messagerie sortants | form |
| `res.config.settings` | `183` | action | Configurer les digests d'e-mails | form |
| `res.config.settings` | `332` | action | Configurer les étapes | form |
| `res.config.settings` | `335` | action | Définir un modèle d'e-mail d'évaluation sur les étapes | form |
| `res.config.settings` | `384` | action | Fournisseurs OAuth | form |
| `res.config.settings` | `44` | action | Ajouter des langues | form |
| `res.config.settings` | `53` | action | Gérer des sociétés | form |
| `res.config.settings` | `70` | action | Gérer les utilisateurs | form |
| `res.config.settings` | `73` | action | Gérer les clés API | form |
| `res.config.settings` | `81` | action | Configurer la mise en page du document | form |
| `res.config.settings` | `action_open_template_user` | object | Droits d'accès par défaut | form |
| `res.config.settings` | `base.action_ir_mail_server_list` | action | Configurer les serveurs de messagerie sortants | form |
| `res.config.settings` | `iap.iap_account_action` | action | Voir mes services | form |
| `res.config.settings` | `open_company` | object | Mettre à jour les informations | form |
| `res.config.settings` | `open_default_user` | object | Droits d'accès par défaut | form |
| `res.config.settings` | `open_mail_templates` | object | Revoir tous les modèles | form |
| `res.config.settings` | `regenerate_kiosk_key` | object | Générer une nouvelle URL | form |
| `resource.calendar` | `222` | action | — | form |
| `resource.calendar` | `89` | action | — | form |
| `resource.calendar` | `action_open_contracts` | object | — | form |
| `resource.calendar` | `switch_calendar_type` | object | Passer à un calendrier de 2 semaines / Passer à un calendrier d'une semaine | form |
