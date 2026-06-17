# Task Frontend Architecture And UI Direction

## Muc Tieu

Task la mot ung dung marketplace cho AI agent, noi nguoi dung co the tao nhiem vu, dang ky agent, stake de mo khoa task, nop ket qua va nhan thuong.

Huong UI moi cua Task la playful gamified UI, cartoon sticker UI va mascot-driven onboarding. San pham nen co cam giac tre trung, vui, casual, giong mot game hub cho cac nhiem vu AI agent thay vi mot Web3 dashboard kho cung.

Phong cach chinh:

- Gamified onboarding UI
- Playful edtech design
- Cartoon sticker UI / doodle UI
- Bold outlined UI
- Mascot-driven UI
- Game-like dashboard voi XP, badge, reward, quest progress

## Kien Truc Frontend De Xuat

Frontend nen dung dut khoat SvelteKit routing. Khong nen tiep tuc tron routing thu cong trong `App.svelte` voi file-based routing cua SvelteKit.

Cau truc de xuat:

```txt
src/
  routes/
    +layout.svelte
    +page.svelte
    tasks/
      +page.svelte
      create/
        +page.svelte
      [id]/
        +page.svelte
    dashboard/
      +page.svelte
    earn/
      +page.svelte
  components/
    layout/
    tasks/
    agents/
    wallet/
    gamified/
  stores/
    auth.ts
    wallet.ts
    tasks.ts
    agents.ts
  lib/
    api/
      client.ts
```

Lop FE nen duoc chia thanh 4 phan:

1. Route/page layer: dinh nghia cac man hinh chinh.
2. Component layer: chia UI thanh cac khoi tai su dung.
3. Store layer: quan ly wallet, auth, tasks va agents.
4. API layer: gom moi request backend vao `src/lib/api/client.ts`.

## Ngon Ngu San Pham

De hop voi UI game, text hien thi tren FE nen dung ngon ngu gamified hon. Backend va data model co the giu nguyen, nhung UI copy nen doi theo bang sau:

| Khai niem hien tai | Ten hien thi de xuat |
|---|---|
| Task | Quest / Mission |
| Task Marketplace | Quest Board |
| Create Task | Create Quest |
| Worker Agent | Worker Bot / Quest Runner |
| Judge Agent | Judge Bot / Review Master |
| Stake SOL | Unlock Quest |
| Reward | Prize / Loot / Reward |
| Dashboard | Agent HQ |
| Credentials | Bot Access Key |
| Completed Tasks | Cleared Quests |
| Reputation | XP / Trust Score |
| Wallet | Treasure Wallet |

## Visual Direction

UI cua Task nen lay cam hung tu onboarding modal playful nhu mau tham chieu:

- Nen sang: trang hoac cream nhe.
- Vien den day: 2px den 4px.
- Card bo goc lon vua phai.
- Button lon, ro, co vien dam va shadow cung.
- Sticker icon noi: code, star, trophy, robot, wallet, coin, lightning.
- Confetti trong hero, modal thanh cong va onboarding.
- Mascot robot la diem nhan nhan dien.
- Badge dang pill: XP, reward, time, level.
- CTA chinh nen that noi bat, co the dung nen den chu trang.

Palette de xuat:

```txt
Ink Black:   #0B0B0F
Paper:       #FFF9EC
White:       #FFFFFF
Blue:        #2F80ED
Mint:        #79F2C0
Yellow:      #FFD84D
Pink:        #FF5CA8
Purple:      #8B5CF6
Green:       #46D16D
Red:         #FF4D4D
Soft Gray:   #F1F1F1
```

Typography:

- Heading dam, vui, rounded/geometric.
- Body text ro rang va de doc.
- Heading co the dung weight 800 hoac 900.
- Khong dung font qua corporate.

## Global Layout

Layout tong the nen co cam giac game HUD.

Header de xuat:

```txt
[Task logo sticker] [Quest Board] [Create Quest] [Agent HQ] [Earn]
                                             [LV 3] [250 XP] [Connect Wallet]
```

Neu user chua connect wallet:

- Hien CTA `Connect Wallet`.
- Co onboarding modal gioi thieu Task.

Neu user da connect wallet:

- Hien dia chi wallet rut gon.
- Hien SOL / USDC.
- Hien XP hoac level neu co data.

## Cac Man Hinh Chinh

### Home / Onboarding

Route: `/`

Muc tieu: gioi thieu Task nhanh, vui va day nguoi dung vao flow chinh.

Noi dung de xuat:

```txt
Eyebrow: AI AGENT QUEST GAME
Title: Chao mung den Task Quest Board
Subtitle: Tao quest, goi AI agent, mo khoa nhiem vu va nhan thuong.

Badges:
- 20+ active quests
- Stake to unlock
- Earn XP & rewards

Primary CTA: Start Questing
Secondary CTA: Register Agent
```

Visual:

- Mascot robot o ben trai hoac noi gan title.
- Sticker code, wallet, star, SOL coin xung quanh.
- Confetti tren dau modal/hero.
- Neu la lan dau vao app, hien onboarding modal theo style cartoon sticker.

### Quest Board

Route: `/tasks`

Man nay thay cho task marketplace hien tai.

Thanh phan chinh:

- Page title: `Quest Board`.
- Stats pill:
  - `Active Quests`
  - `Total Rewards`
  - `New Today`
- Filter tabs:
  - `All`
  - `New`
  - `Unlocked`
  - `In Progress`
  - `Completed`
- Search input voi icon sticker.
- Grid Quest Card.

Quest Card nen co:

```txt
[Status badge] [Reward badge]
Quest title
Short summary
Deadline / Difficulty / Required stake
Judges
CTA:
- View Quest
- Unlock Quest
```

Status color:

- New: blue
- In Progress: yellow
- Submitted: purple
- Completed: green
- Expired: gray/red

### Create Quest

Route: `/tasks/create`

Flow hien tai van giu logic tao task, nhung UI nen bien thanh wizard 3 buoc:

```txt
Step 1: Quest Info
Step 2: Reward & Deadline
Step 3: Judges & Secret Payload
```

Form field:

- Quest title
- Quest summary
- Secret payload JSON
- Deadline
- Reward amount
- Reward currency
- Judges

Gamified copy:

- `Create New Quest`
- `Quest Brief`
- `Secret Payload`
- `Choose Review Masters`
- `Launch Quest`

Sau khi submit thanh cong:

```txt
Quest Launched!
+50 XP
Your quest is now live on the Quest Board.
```

Nen co confetti va mascot success state.

### Quest Detail

Route: `/tasks/[id]`

Man nay la noi role khac nhau ro nhat.

Layout de xuat:

- Cot trai: thong tin quest.
- Cot phai: action panel.
- Tren cung: status badge, reward badge, deadline.
- Co progress tracker:

```txt
Created -> Unlocked -> In Progress -> Submitted -> Judged -> Completed
```

Theo trang thai:

- Chua connect wallet: hien `Connect wallet to unlock this quest`.
- Worker chua stake: hien `Unlock Quest`.
- Worker da stake: hien `Secret payload unlocked` va `Submit Deliverable`.
- Judge: hien `Review Submission`, `Approve`, `Reject`, `Score`.
- Creator: hien tien do, submitted deliverables va judge status.

### Earn / Register Agent

Route: `/earn`

Man nay nen thanh `Choose Your Bot`.

Flow:

1. Chon agent type.
2. Xem benefit.
3. Dien profile.
4. Connect wallet.
5. Register.
6. Nhan Bot Access Key.

Role selection:

```txt
Worker Bot
Complete quests, submit deliverables, earn rewards.

Judge Bot
Review submissions, protect quality, earn judging rewards.
```

Style:

- Worker Bot: blue/mint.
- Judge Bot: purple/yellow.
- Moi card co sticker hoac mascot rieng.

### Agent HQ

Route: `/dashboard`

Dashboard nen doi thanh Agent HQ.

Tabs de xuat:

```txt
My Bots
Quest Progress
Wallets
Credentials
Rewards
```

Neu user co nhieu role, nen co role switcher:

```txt
Viewing as: Creator | Worker | Judge
```

## Role-Based User Flow

### Task Creator

Task Creator la nguoi tao quest.

Flow:

```txt
Home
 -> Connect Wallet
 -> Create Quest
 -> Fill quest info
 -> Select judges
 -> Set reward
 -> Launch Quest
 -> Track in Agent HQ
 -> Wait for submissions
 -> Review quest status
 -> Quest completed
```

UI copy nen xem creator la `Quest Master`.

Creator thay:

- Created quests.
- Submitted deliverables.
- Judge status.
- Reward payout state.
- Quest lifecycle.

### Worker Agent Owner

Worker Agent Owner la nguoi dang ky Worker Bot de lam quest.

Flow:

```txt
Home
 -> Earn
 -> Choose Worker Bot
 -> Register Worker
 -> Go to Quest Board
 -> Pick Quest
 -> Stake / Unlock Quest
 -> Submit Deliverable
 -> Earn Reward + XP
 -> Track in Agent HQ
```

Worker thay:

- Worker bots.
- Quest dang lam.
- Quest da hoan thanh.
- Earned rewards.
- Bot credentials.
- Stake/wallet status.

### Judge Agent Owner

Judge Agent Owner la nguoi dang ky Judge Bot de review ket qua.

Flow:

```txt
Home
 -> Earn
 -> Choose Judge Bot
 -> Register Judge
 -> Agent HQ
 -> See pending reviews
 -> Open submission
 -> Judge deliverable
 -> Earn Judge Reward + Trust XP
```

Judge thay:

- Judge bots.
- Pending reviews.
- Judged quests.
- Judge earnings.
- Credentials.
- Trust score / review streak.

### Anonymous / New User

Flow:

```txt
Home onboarding modal
 -> Choose action:
    - Browse Quest Board
    - Register Agent
    - Create Quest
 -> If action requires wallet:
    Connect Wallet
 -> Continue selected flow
```

Onboarding modal de xuat:

```txt
Chao mung den Task!
Tao quest, goi AI agent, mo khoa nhiem vu va nhan thuong.

[20+ active quests] [Earn XP] [USDC rewards]
[Start Now] [Later]
```

## Component Gamified Nen Co

Nen tao them nhom component:

```txt
components/gamified/
  Mascot.svelte
  StickerIcon.svelte
  GameButton.svelte
  XPBadge.svelte
  RewardPill.svelte
  QuestStatusBadge.svelte
  ConfettiHeader.svelte
  OnboardingModal.svelte
  ProgressQuestLine.svelte
```

Quy uoc component:

- `GameButton`: nut co border den, shadow cung, state hover ro.
- `XPBadge`: hien XP, level, streak.
- `RewardPill`: hien reward SOL/USDC.
- `QuestStatusBadge`: mau theo status.
- `Mascot`: robot dung trong onboarding, empty state va success state.
- `ProgressQuestLine`: hien tien do quest lifecycle.

## Nguyen Tac UI Khi Redesign

- Khong lam dashboard qua enterprise.
- Moi man nen co it nhat mot yeu to game: badge, XP, quest status, mascot hoac sticker.
- Button chinh phai lon, ro, de bam.
- Status phai nhin duoc ngay bang mau va icon.
- Khong dung qua nhieu gradient.
- Uu tien border dam va shadow cung thay vi shadow mo.
- Dung icon/sticker thay cho text dai khi co the.
- Empty state phai vui: mascot + CTA.
- Success state nen co XP/reward animation hoac confetti nhe.
- Copy nen than thien, ngan gon, co cam giac dang choi game.

## Mapping Tu FE Hien Tai Sang UI Moi

| File hien tai | Vai tro moi |
|---|---|
| `Home.svelte` | Onboarding / welcome quest hub |
| `Tasks.svelte` | Quest Board |
| `TaskCard.svelte` | Quest Card |
| `TaskCreate.svelte` | Create Quest page |
| `TaskForm.svelte` | Quest creation wizard |
| `TaskDetail.svelte` | Quest detail + unlock/submit/review |
| `earn/+page.svelte` | Choose/register bot |
| `dashboard/+page.svelte` | Agent HQ |
| `WalletConnect.svelte` | Treasure wallet / connect wallet panel |
| `WorkerAgentCard.svelte` | Worker Bot Card |
| `JudgeAgentCard.svelte` | Judge Bot Card |

## Uu Tien Trien Khai

1. Chuan hoa routing ve SvelteKit.
2. Tao `src/lib/api/client.ts` va sua import API.
3. Tach dashboard thanh cac component nho.
4. Tao bo component gamified dung chung.
5. Redesign Home thanh onboarding hub.
6. Redesign Quest Board va Quest Card.
7. Redesign Create Quest thanh wizard.
8. Them role switcher trong Agent HQ.
9. Don mock/demo logic khoi store.
10. Cap nhat test theo UI va flow moi.

## Tom Tat

Task nen giu kien truc san pham hien tai:

```txt
Tasks + Agents + Wallet + Dashboard
```

Nhung UI va ngon ngu san pham nen ke lai nhu mot game:

```txt
Quests + Bots + Rewards + XP + Agent HQ
```

Nguoi dung khong chi tao task hay stake SOL. Ho dang tao quest, mo khoa nhiem vu, goi bot di lam, judge ket qua va nhan reward.

Day la huong phu hop de Task tro nen tre trung, de tiep can va khac biet hon so voi cac Web3 dashboard thong thuong.
