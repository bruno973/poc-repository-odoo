# Fixtures Odoo 18 (architectures résolues)

**Reconstructions**, sur la structure des vues standard Odoo 18 (`hr`, `hr_attendance`) et
d'un héritage type `leila_hr`. Elles servent aux tests du parseur et du faux serveur
(`test/fake-odoo.ts`), qui applique les attributs `groups` comme le fait `get_views`.

**À remplacer** par les architectures réellement renvoyées par `get_views()` sur `amg`
(inventaire UI-001, depuis un poste du tailnet), pour chaque profil de test.
