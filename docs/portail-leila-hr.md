# Accès portail des employés (Q-10) — ce que Leila attend de `leila_hr`

Décision Q-10 : les employés (comptes **portail**) utilisent des écrans dédiés de Leila
(« Accueil », « Mes pointages »), appelés avec **leur propre session Odoo**. Leila ne lit
jamais en `sudo` : c'est Odoo qui garantit, par ses droits d'accès et ses règles
d'enregistrement, que chacun ne voit que ses données. Le BFF ajoute une défense en
profondeur (il ne garde que les lignes de la fiche de l'utilisateur), mais il ne remplace pas
les règles.

## Ce que fait Leila

| Étape | Appel (session de l'employé) | Si refusé |
|---|---|---|
| Connexion | `res.users.read` (soi-même), `has_group(base.group_user)` → compte portail | — |
| Fiche employé | annuaire (`hr.employee.public`) par `user_id`, puis par contact `work_contact_id` ; sinon l'employé de ses pointages s'il est **unique** | pas de fiche : écran vide + message |
| Mes pointages | `hr.attendance.search_read` restreint à SA fiche (hors absences automatiques d'1 s) | — |
| Ventilation | `hr.attendance.ventilation.search_read` sur ces pointages | **heures pointées seules**, bandeau « détail pas encore accessible » |
| Fuseau | `res.users.tz` (soi-même), sinon America/Cayenne (signalé) | — |

Période et semaine viennent de la ventilation (`closure_id`, `week_number`, `week_label`) ;
les libellés des relations sont fournis par Odoo à la lecture, aucun droit sur
`hr.attendance.closure` n'est nécessaire.

## À ajouter dans `leila_hr`

Le lien entre un compte portail et sa fiche est le **contact** : l'invitation portail crée
l'utilisateur sur `work_contact_id` de l'employé ; `user_id` n'est renseigné qu'après coup
(`_sync_employee_from_partner`) et était vide pour le compte testé sur amg. Les règles
s'appuient donc sur le contact.

### 1. Règle sur les présences (corrige la fuite constatée le 23/10/2026)

`security/ir_rule.xml` :

```xml
<record id="hr_attendance_rule_portal_own" model="ir.rule">
    <field name="name">Présences : un compte portail ne voit que les siennes</field>
    <field name="model_id" ref="hr_attendance.model_hr_attendance"/>
    <field name="domain_force">[('employee_id.work_contact_id', '=', user.partner_id.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_portal'))]"/>
</record>
```

### 2. Lecture de la ventilation par le portail (détail des heures dans Leila)

`security/ir.model.access.csv` (lecture seule) :

```csv
access_ventilation_portal,Ventilation portail (lecture),model_hr_attendance_ventilation,base.group_portal,1,0,0,0
```

`security/ir_rule.xml` :

```xml
<record id="ventilation_rule_portal_own" model="ir.rule">
    <field name="name">Ventilation : un compte portail ne voit que la sienne</field>
    <field name="model_id" ref="model_hr_attendance_ventilation"/>
    <field name="domain_force">[('employee_id.work_contact_id', '=', user.partner_id.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_portal'))]"/>
</record>
```

Sans ces deux ajouts, « Mes pointages » fonctionne quand même, avec les heures pointées
seulement.

### 3. Vérification

Après mise à jour du module :

```
cd api
SONDE_LOGIN=<compte portail> SONDE_PASSWORD=… npm run sonde-portail
```

Attendu dans « Cloisonnement » : **✅ un seul propriétaire visible** pour `hr.attendance`
**et** `hr.attendance.ventilation`. Recommencer avec un second compte portail.

## Remarque sur la page portail existante (`/my/pointages`)

Le contrôleur `controllers/portal.py` retrouve l'employé par `user_id` et lit en `sudo()`.
Un compte relié seulement par le contact (cas constaté : `user_id` vide) n'y voit rien,
alors que Leila retrouve sa fiche. Si la page portail reste en service, la recherche
`('user_id', '=', uid)` gagnerait à devenir
`['|', ('user_id', '=', uid), ('work_contact_id', '=', request.env.user.partner_id.id)]`.
