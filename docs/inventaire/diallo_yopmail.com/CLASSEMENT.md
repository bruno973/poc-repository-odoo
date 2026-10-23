# Classement des manques — compte `diallo_yopmail.com`

21 vues, 5 modèles. Généré par `npm run classement` (hors ligne, depuis les fichiers de l'inventaire).

Lecture : un manque se traite **une fois** dans le moteur et disparaît de toutes les vues concernées.
« Transversal » = présent sur plusieurs modèles (à implémenter en priorité) ; « propre à » = un seul modèle
(souvent un widget spécifique d'Odoo : candidat à un lien « Ouvrir dans Odoo »).

## Synthèse

| Famille | Manques distincts | Transversaux | Occurrences |
|---|---|---|---|
| Types de champ | 1 | 0 | 1 |
| Widgets | 7 | 0 | 8 |
| Éléments de vue | 8 | 3 | 33 |
| Recherche | 3 | 2 | 18 |
| Boutons | 2 | 1 | 12 |
| Expressions | 1 | 1 | 4 |

## Types de champ

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| binary | Attention | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |

## Widgets

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| state_selection | Info | 2 | 2 | propre à `hr.contract` | hr.contract.form, hr.contract.list |
| hr_org_chart | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |
| hr_presence_status | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |
| monetary | Info | 1 | 1 | propre à `hr.contract` | hr.contract.list |
| resume_one2many | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |
| skills_one2many | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |
| work_entry_source_field | Info | 1 | 1 | propre à `hr.contract` | hr.contract.form |

## Éléments de vue

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Texte libre de la vue non importé. | Info | 3 | 19 | transversal (3 modèles) | hr.attendance.form, hr.contract.form, hr.employee.public.form |
| « header » de liste non pris en charge. | Info | 2 | 4 | transversal (2 modèles) | hr.attendance.closure.list, hr.attendance.list |
| Élément visuel « web_ribbon » non pris en charge. | Info | 2 | 2 | transversal (2 modèles) | hr.contract.form, hr.employee.public.form |
| « chatter » non pris en charge. | Attention | 1 | 3 | propre à `hr.attendance` | hr.attendance.form |
| Sous-vue de relation non tabulaire : affichée en liste de noms. | Info | 1 | 2 | propre à `hr.employee.public` | hr.employee.public.form |
| « searchpanel » de recherche non pris en charge. | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.search |
| Élément visuel « contract_warning_tooltip » non pris en charge. | Info | 1 | 1 | propre à `hr.contract` | hr.contract.form |
| Élément visuel « hr_employee_chat » non pris en charge. | Info | 1 | 1 | propre à `hr.employee.public` | hr.employee.public.form |

## Recherche

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Filtre non pris en charge : désactivé. | Info | 3 | 10 | transversal (3 modèles) | hr.attendance.search, hr.attendance.ventilation.search, hr.contract.search |
| Recherche sur ce champ non prise en charge : désactivée. | Info | 2 | 4 | transversal (2 modèles) | hr.attendance.search, hr.contract.search |
| Regroupement non pris en charge. | Info | 1 | 4 | propre à `hr.attendance` | hr.attendance.search |

## Boutons

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Bouton hors du registre de commandes : affiché désactivé. | Info | 3 | 9 | transversal (3 modèles) | hr.attendance.form, hr.contract.form, hr.employee.public.form |
| Bouton de liste non pris en charge. | Info | 1 | 3 | propre à `hr.attendance` | hr.attendance.list |

## Expressions

| Manque | Niveau | Vues | Occurrences | Portée | Vues concernées |
|---|---|---|---|---|---|
| Décoration de cellule ignorée : style neutre. | Info | 2 | 4 | transversal (2 modèles) | hr.attendance.list, hr.contract.list |

## Boutons candidats au registre de commandes

Le registre est fermé (ADR-001) : chaque bouton retenu demande une commande Leila explicite, testée avec les droits.

| Modèle | Bouton | Type | Libellé | Vues |
|---|---|---|---|---|
| `hr.attendance` | `action_in_attendance_maps` | object | Voir dans Maps | form |
| `hr.attendance` | `action_open_attendance_form` | object | — | list |
| `hr.attendance` | `action_out_attendance_maps` | object | Voir dans Maps | form |
| `hr.contract` | `action_open_contract_list` | object | — | form |
| `hr.employee.public` | `367` | action | Attribuer un badge | form |
