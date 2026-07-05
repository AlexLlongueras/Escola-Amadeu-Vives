# Guia de Xarxa Local (LAN) — Escola Amadeu Vives
## Gestió d'Horaris: Configuració Multidispositiu

**Versió:** 2.0 · **Idioma:** Català formal  
**Aplicable a:** Windows 10/11, macOS 13+, Ubuntu 22.04+

---

## Índex

1. [Introducció al model Servidor-Client](#1-introducció-al-model-servidor-client)
2. [Configuració de l'ordinador Servidor](#2-configuració-de-lordinador-servidor)
3. [Configuració dels ordinadors Clients](#3-configuració-dels-ordinadors-clients)
4. [Protocol de proves i resolució de problemes](#4-protocol-de-proves-i-resolució-de-problemes)
5. [Instal·lació en un ordinador nou (des de zero)](#5-installació-en-un-ordinador-nou-des-de-zero)

---

## 1. Introducció al model Servidor-Client

### Com funciona el sistema

Aquesta aplicació segueix el model **Servidor-Client** (*Client-Server*). Dins la xarxa Wi-Fi de l'escola, els ordinadors es divideixen en dos rols:

- **Un únic ordinador actua com a Servidor:** allotja la base de dades MySQL i executa el servidor Node.js que gestiona tota la lògica de l'aplicació.
- **La resta d'ordinadors actuen com a Clients:** simplement obren un navegador web i accedeixen a l'aplicació introduint la URL del servidor. **No cal instal·lar res** als ordinadors clients.

```
┌─────────────────────────────────────────────────────────────────┐
│                     XARXA WI-FI DE L'ESCOLA                     │
│                                                                  │
│   ┌──────────────────┐        ┌───────────────┐                 │
│   │  💻 SERVIDOR     │◄──────►│ 💻 CLIENT 1   │                 │
│   │  Node.js + MySQL │        │  Navegador    │                 │
│   │  192.168.1.45    │        │  Chrome/Edge  │                 │
│   └──────────────────┘        └───────────────┘                 │
│            ▲                                                     │
│            │               ┌───────────────┐                    │
│            └──────────────►│ 💻 CLIENT 2   │                    │
│                            │  Navegador    │                    │
│                            │  Chrome/Edge  │                    │
│                            └───────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### ⚠️ Condició fonamental: el Servidor ha d'estar encès

**L'ordinador Servidor ha d'estar encès i amb el servidor Node.js en marxa** perquè qualsevol client pugui accedir a l'aplicació. Si el servidor s'apaga o es reinicia, els clients perdran la connexió fins que el servidor torni a estar operatiu.

> **Alternativa futura (núvol):** Si es vol eliminar aquesta dependència i que l'aplicació funcioni des de qualsevol lloc sense necessitat de mantenir un ordinador encès a l'escola, es pot migrar la base de dades a un servei al núvol com **[Supabase](https://supabase.com)** (gratuït) o **PlanetScale**, i desplegar el servidor Node.js a **Railway** o **Render** (també gratuïts en el seu pla bàsic). Aquesta migració permetria accedir a l'aplicació des de casa o des de qualsevol dispositiu amb connexió a internet, sense dependre de cap ordinador de l'escola.

---

## 2. Configuració de l'ordinador Servidor

Tots els passos d'aquesta secció s'han d'executar **únicament a l'ordinador que farà de Servidor**.

### Pas 2.1 — Trobar la IP local del Servidor

La IP local és l'adreça que identifica l'ordinador Servidor dins la xarxa Wi-Fi de l'escola. Aquesta és l'adreça que hauran d'utilitzar els clients per connectar-se.

#### A Windows

1. Premeu `Win + R`, escriviu `cmd` i premeu `Intro`.
2. Executeu:

```cmd
ipconfig
```

3. Cerqueu la secció **Adaptador Ethernet** o **Adaptador Wi-Fi sense fils** i localitzeu el camp:

```
Adreça IPv4 . . . . . . . . . . . : 192.168.1.45
```

> **Exemple real:** La IP del servidor podria ser `192.168.1.45`. Anoteu-la: és la que introduiran els clients al navegador i la que s'ha de configurar al codi.

#### A macOS

Obriu el **Terminal** (Aplicacions → Utilitats → Terminal) i executeu:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

La IP local apareixerà en el format `192.168.X.XX` o `10.0.X.XX`.

#### A Linux/Ubuntu

```bash
ip a | grep "inet " | grep -v 127.0.0.1
```

---

> **Recomanació pràctica:** Per evitar que la IP del servidor canviï en reiniciar l'ordinador, demaneu a l'administrador de la xarxa escolar que **reservi la IP per adreça MAC** al router. D'aquesta manera, la IP sempre serà la mateixa i els clients no hauran de reconfigurar res.

---

### Pas 2.2 — Arrencar el servidor Node.js

Obriu un terminal a la carpeta del projecte i executeu:

```bash
node server.js
```

Hauríeu de veure un missatge com:

```
✅ Connexió a MySQL establerta correctament.
🚀 Servidor escoltant al port 3000
```

**Deixeu aquest terminal obert** durant tota la sessió de treball. Si es tanca, els clients deixaran de tenir accés.

---

### Pas 2.3 — Obrir el port 3000 al Tallafoc

Per defecte, els sistemes operatius bloquegen les connexions entrants des d'altres dispositius. Cal crear una regla que permeti el trànsit al port **3000** des de la xarxa local de l'escola.

#### A Windows (Windows Defender Firewall)

1. Aneu a **Inici** → cerqueu **"Tallafoc de Windows Defender"** → **"Configuració avançada"**.
2. Al menú esquerre, feu clic a **"Regles d'entrada"**.
3. A la dreta, feu clic a **"Nova regla..."**.
4. Seguiu l'assistent amb les opcions següents:

| Pas de l'assistent | Opció a triar |
|---|---|
| Tipus de regla | **Port** |
| Protocol | **TCP** |
| Ports locals específics | **3000** |
| Acció | **Permetre la connexió** |
| Perfils | Marqueu **únicament "Privada"** *(desmarqueu "Pública" i "Domini")* |
| Nom de la regla | `Node.js – Gestió Horaris Escola (port 3000)` |

> **Per què només "Privada"?** Marcant únicament el perfil "Privada", la regla s'activa exclusivament quan l'ordinador està connectat a xarxes de confiança (com la Wi-Fi de l'escola). Si algú s'endú l'ordinador i es connecta a una Wi-Fi pública (cafeteria, aeroport, etc.), el port **romandrà tancat automàticament**, protegint l'ordinador contra accessos no autoritzats.

#### A macOS

Aneu a **Preferències del Sistema** → **Seguretat i privadesa** → pestanya **Tallafoc** → **Opcions del tallafoc...** i afegiu `node` a la llista d'aplicacions permeses seleccionant **"Permetre les connexions entrants"**.

---

### Pas 2.4 — Verificació del servidor

Des del mateix ordinador servidor, obriu un navegador i accediu a:

```
http://localhost:3000
```

Si es carrega la pantalla d'inici de sessió, el servidor està operatiu i preparat per rebre connexions dels clients.

---

## 3. Configuració dels ordinadors Clients

### Pas 3.1 — Modificar el codi perquè els clients es connectin al servidor

Quan l'aplicació s'executa als ordinadors clients, el navegador ha d'enviar les peticions a l'API **al servidor de l'escola**, no a `localhost` (que seria el propi ordinador del client). Cal revisar i, si escau, modificar el fitxer:

```
public/js/main.js
```

#### Com fer-ho

Obriu el fitxer `public/js/main.js` i cerqueu qualsevol ocurrència de:

```javascript
http://localhost:3000
```

Si en trobeu alguna, substituïu-la per la IP local del servidor anotada al Pas 2.1:

```javascript
http://192.168.1.45:3000
```

> **Exemple pràctic:** Si les funcions `apiGet`, `apiPost`, `apiPut` i `apiDelete` del fitxer `main.js` fan servir rutes relatives (és a dir, comencen per `/api/...` sense cap adreça al davant), **no cal fer cap canvi**: el navegador ja enviarà automàticament les peticions al servidor des d'on va carregar la pàgina. Però si detecteu referències explícites a `http://localhost:3000`, cal substituir-les.

#### Per a cada ordinador client

Un cop realitzat el canvi (si era necessari), guardeu el fitxer. El canvi s'aplica a tots els clients alhora, ja que tots carreguen el mateix fitxer `main.js` des del servidor.

---

### Pas 3.2 — Obrir l'aplicació des del navegador del client

Als ordinadors clients, **no cal instal·lar res**. Únicament necessiten un navegador modern (Chrome, Edge, Firefox o Safari).

1. Obriu el navegador.
2. A la **barra d'adreces**, introduïu la URL del servidor:

```
http://192.168.1.45:3000
```

> **Substituïu `192.168.1.45`** per la IP real del vostre servidor anotada al Pas 2.1.

3. Si tot és correcte, veureu la pantalla d'inici de sessió de l'aplicació.
4. Introduïu les credencials d'administrador i ja podreu treballar col·laborativament, compartint la mateixa base de dades en temps real.

---

### Pas 3.3 — (Opcional) Accés directe a l'escriptori

Per facilitar l'accés sense haver d'escriure la URL cada vegada:

**A Windows:** feu clic dret a l'escriptori → **Nou** → **Accés directe** → introduïu com a ubicació:

```
http://192.168.1.45:3000
```

Poseu-li el nom **"Gestió d'Horaris"** i feu clic a **Finalitzar**. L'accés directe obrirà directament l'aplicació al navegador predeterminat.

---

## 4. Protocol de proves i resolució de problemes

### ✅ Llista de verificació prèvia

Abans de diagnosticar qualsevol problema, comproveu que es compleixen **totes** aquestes condicions:

- [ ] L'ordinador Servidor **està encès**.
- [ ] El servidor Node.js **s'està executant** (el terminal amb `node server.js` està obert i sense errors).
- [ ] Tant el servidor com els clients estan connectats a la **mateixa xarxa Wi-Fi** de l'escola (i **no** a la xarxa d'invitats).
- [ ] El port 3000 **està obert al tallafoc** del servidor (Pas 2.3).
- [ ] La IP introduïda a la URL del client **coincideix** amb la IP del servidor (Pas 2.1).

---

### Problema 1 — El client no carrega la pàgina

**Símptoma:** El navegador del client mostra "Aquesta pàgina no està disponible", "ERR_CONNECTION_REFUSED" o simplement no respon.

**Causes i solucions:**

| Causa probable | Com verificar-ho | Solució |
|---|---|---|
| El servidor Node.js no s'està executant | Al servidor, comproveu si el terminal amb `node server.js` està obert | Torneu a executar `node server.js` al servidor |
| IP incorrecta a la URL del client | Compareu la URL del client amb la IP obtinguda al Pas 2.1 | Corregiu la IP a la barra d'adreces |
| Port bloquejat pel tallafoc | Des del client, feu `ping 192.168.1.45` (ha de respondre) | Reviseu el Pas 2.3 i assegureu-vos que la regla existeix |
| El client és a la **xarxa d'invitats** | Comproveu a quina Wi-Fi està connectat el client | Canvieu a la xarxa principal de l'escola, la mateixa que el servidor |

---

### Problema 2 — El ping funciona però la pàgina no carrega

**Símptoma:** La comanda `ping 192.168.1.45` respon correctament però el navegador no carrega l'aplicació.

**Causes i solucions:**

- **Aïllament d'AP (*AP Isolation*):** Alguns routers escolars activen aquesta funció per seguretat, impedint que els dispositius connectats a la mateixa Wi-Fi es "vegin" entre si. Contacteu l'administrador de xarxa de l'escola i demaneu que desactivi l'opció **"AP Isolation"** o **"Client Isolation"** al punt d'accés.

- **VLAN separades:** En xarxes escolars grans, els ordinadors dels professors i els dels alumnes poden estar en VLAN diferents. Assegureu-vos que tots els dispositius implicats estiguin a la mateixa VLAN o demaneu al tècnic de xarxa que permeti el trànsit entre elles al port 3000.

---

### Problema 3 — La pàgina carrega però no pot iniciar sessió

**Símptoma:** La pantalla d'inici de sessió es veu correctament però en fer clic a "Iniciar sessió" apareix un error.

**Solució:** Obriu les eines de desenvolupador del navegador (`F12` → pestanya **Consola**) i cerqueu el missatge d'error. Normalment indica:

- **"Failed to fetch":** El servidor Node.js s'ha aturat. Torneu a executar `node server.js` al servidor.
- **"401 Unauthorized":** Credencials incorrectes. Comproveu l'usuari i contrasenya.
- **Error de base de dades:** MySQL no s'està executant al servidor. Reinicieu el servei MySQL.

---

### Problema 4 — Dos usuaris editen la mateixa franja simultàniament

**Símptoma:** Una persona sobreescriu els canvis de l'altra sense adonar-se'n.

**Prevenció:** L'aplicació no disposa (de moment) de bloqueig d'edició concurrent. Establiu un **protocol d'ús a l'escola**: acordeu quina persona s'encarrega de cada grup horari per evitar conflictes. Cada canvi queda guardat immediatament a la base de dades; per veure els canvis d'un altre usuari, simplement recarregueu la pàgina (`F5`).

---

## Resum ràpid de posada en marxa

```
1. Al SERVIDOR:
   a. Obriu un terminal a la carpeta del projecte.
   b. Executeu:  node server.js
   c. Anoteu la IP local:  ipconfig (Windows) / ip a (Linux/Mac)

2. Al CODI (una sola vegada):
   a. Obriu:  public/js/main.js
   b. Cerqueu:  http://localhost:3000
   c. Si existeix, substituïu-la per:  http://[IP-SERVIDOR]:3000

3. Als CLIENTS:
   a. Obriu Chrome o Edge.
   b. Escriviu a la barra d'adreces:  http://[IP-SERVIDOR]:3000
   c. Inicieu sessió amb les credencials d'administrador.
```

---

---

## 5. Instal·lació en un ordinador nou (des de zero)

Aquesta secció explica com posar en marxa l'aplicació en un ordinador que **no té res instal·lat**: ni Node.js, ni MySQL, ni el codi del projecte. Seguiu els passos en ordre.

---

### Pas 5.1 — Instal·lar Node.js

1. Aneu a **[https://nodejs.org](https://nodejs.org)** i descarregueu la versió **LTS** (és la recomanada i estable).
2. Executeu l'instal·lador i seguiu l'assistent amb les opcions predeterminades.
3. Un cop instal·lat, obriu un terminal i verifiqueu que funciona:

```cmd
node --version
npm --version
```

Hauríeu de veure quelcom com `v22.x.x` i `10.x.x`. Si apareix algun número de versió, Node.js és correcte.

---

### Pas 5.2 — Instal·lar MySQL 8.0

1. Aneu a **[https://dev.mysql.com/downloads/installer/](https://dev.mysql.com/downloads/installer/)** i descarregueu el **MySQL Installer for Windows** (la versió `mysql-installer-community`).
2. Executeu l'instal·lador. Quan pregunti pel tipus d'instal·lació, trieu **"Developer Default"** o, si voleu instal·lació mínima, **"Custom"** i seleccioneu:
   - `MySQL Server 8.0`
   - `MySQL Workbench` (recomanat per gestionar la BD visualment)
3. Durant la configuració del servidor MySQL:
   - **Authentication Method:** trieu `Use Strong Password Encryption` (primera opció).
   - **Root Password:** poseu la mateixa contrasenya que té el `.env` del projecte o anoteu la que poseu, ja que la necessitareu al Pas 5.4.
4. Finalitzeu l'instal·lació. El servei MySQL s'iniciarà automàticament.

> **Verificació:** Obriu MySQL Workbench i intenteu connectar-vos amb `root` i la contrasenya que heu definit. Si es connecta, MySQL funciona correctament.

---

### Pas 5.3 — Copiar el projecte al nou ordinador

**No copieu la carpeta `node_modules`** — ocupa centenars de megabytes i es regenera automàticament. El que heu de copiar és la resta del projecte.

#### Opció A — Via USB/pendrive (recomanada per a la primera vegada)

1. A l'ordinador **original**, aneu a la carpeta del projecte.
2. Comprimiu-la en un ZIP **excloent** la carpeta `node_modules`:
   - Seleccioneu tots els fitxers i carpetes *excepte* `node_modules` → clic dret → **"Comprimir en fitxer ZIP"**.
3. Copieu el ZIP al pendrive i porteu-lo al nou ordinador.
4. Al nou ordinador, descomprimiu el ZIP a la ubicació que vulgueu (per exemple, `C:\TFG\Implementacio`).

#### Opció B — Via Git (si el projecte té repositori)

```bash
git clone [URL-del-repositori] C:\TFG\Implementacio
```

---

### Pas 5.4 — Configurar el fitxer `.env`

A la carpeta del projecte hi ha un fitxer `.env` que conté les credencials de connexió a la base de dades. Cal revisar-lo i adaptar-lo al nou ordinador.

Obriu el fitxer `.env` amb un editor de text (Bloc de Notes o VS Code):

```
# Servidor
PORT=3000
NODE_ENV=development

# Base de dades MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=[LA CONTRASENYA QUE HEU POSAT AL INSTAL·LAR MYSQL]
DB_NAME=escola_amadeu_vives

# Seguretat JWT
JWT_SECRET=escola_amadeu_vives_secret_key_2025
JWT_EXPIRES_IN=8h
```

**L'únic camp que normalment cal canviar és `DB_PASSWORD`**: poseu la contrasenya de `root` que heu definit al Pas 5.2.

---

### Pas 5.5 — Exportar la base de dades de l'ordinador original

> **Feu aquest pas a l'ordinador original (el que té les dades actuals).**

La base de dades conté totes les taules, els horaris, els grups, els professors, etc. Cal exportar-la com a fitxer `.sql` i portar-la al nou ordinador.

#### Opció A — Des de MySQL Workbench (més fàcil)

1. Obriu MySQL Workbench i connecteu-vos al servidor local.
2. Aneu al menú **Server** → **Data Export**.
3. Seleccioneu la base de dades **`escola_amadeu_vives`**.
4. Trieu **"Export to Self-Contained File"** i poseu un nom, per exemple `escola_amadeu_vives_backup.sql`.
5. Assegureu-vos que teniu marcades les opcions **"Include Create Schema"** i **"Dump Stored Procedures and Functions"**.
6. Feu clic a **"Start Export"**.

#### Opció B — Des del terminal (ràpid)

```cmd
mysqldump -u root -p --databases escola_amadeu_vives > escola_amadeu_vives_backup.sql
```

Introduïu la contrasenya quan us la demani. Es crearà el fitxer `escola_amadeu_vives_backup.sql` a la carpeta on esteu.

> Copieu aquest fitxer `.sql` al nou ordinador (via USB o qualsevol altre mètode).

---

### Pas 5.6 — Importar la base de dades al nou ordinador

> **Feu aquest pas al nou ordinador.**

#### Opció A — Des de MySQL Workbench (més fàcil)

1. Obriu MySQL Workbench i connecteu-vos al servidor local.
2. Aneu al menú **Server** → **Data Import**.
3. Trieu **"Import from Self-Contained File"** i seleccioneu el fitxer `.sql` que heu copiat.
4. A **"Default Target Schema"**, escriviu `escola_amadeu_vives` (o deixeu-ho en blanc si el fitxer ja inclou `CREATE DATABASE`).
5. Feu clic a **"Start Import"**.

#### Opció B — Des del terminal

```cmd
mysql -u root -p < escola_amadeu_vives_backup.sql
```

Si el fitxer no inclou la instrucció `CREATE DATABASE`, primer cal crear la base de dades manualment:

```cmd
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS escola_amadeu_vives CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p escola_amadeu_vives < escola_amadeu_vives_backup.sql
```

> **Verificació:** Obriu MySQL Workbench, connecteu-vos i expandiu la base de dades `escola_amadeu_vives`. Hauríeu de veure totes les taules: `HORARI_LECTIU`, `PROFESSOR`, `ASIGNATURA`, `AULA`, `GRUPS_CLASSE`, `USUARI`, etc.

---

### Pas 5.7 — Instal·lar les dependències Node.js

Obriu un terminal a la carpeta del projecte i executeu:

```cmd
npm install
```

Això llegeix el fitxer `package.json` i descarrega automàticament totes les llibreries necessàries (`express`, `mysql2`, `jsonwebtoken`, `bcryptjs`, etc.). Tarda uns 30 segons. Al final apareixerà quelcom com:

```
added 87 packages in 15s
```

---

### Pas 5.8 — Arrencar l'aplicació i verificar

```cmd
node server.js
```

Hauríeu de veure:

```
✅ Connexió a MySQL establerta correctament.
🚀 Servidor escoltant al port 3000
```

Obriu el navegador i accediu a:

```
http://localhost:3000
```

Si apareix la pantalla d'inici de sessió, **l'aplicació funciona correctament** al nou ordinador.

---

### Resum ràpid — instal·lació en ordinador nou

```
ORDINADOR ORIGINAL:
  1. mysqldump -u root -p --databases escola_amadeu_vives > backup.sql
  2. Copieu la carpeta del projecte (sense node_modules) i el backup.sql al nou ordinador.

NOU ORDINADOR:
  3. Instal·leu Node.js LTS   →  nodejs.org
  4. Instal·leu MySQL 8.0     →  dev.mysql.com/downloads/installer
  5. Importeu la BD:
       mysql -u root -p < backup.sql
  6. Editeu .env amb la contrasenya de MySQL del nou ordinador.
  7. npm install
  8. node server.js
  9. Obriu:  http://localhost:3000
```

---

*Document elaborat per a ús intern de l'Escola Amadeu Vives. Qualsevol dubte tècnic addicional, contacteu amb el responsable TIC del centre.*
