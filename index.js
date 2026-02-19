const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    PermissionsBitField
} = require('discord.js');

const express = require("express");
const fs = require('fs');

/* ---------------- BASIC CONFIG ---------------- */

const OWNER_ID = "1473949099580719177";
const DATA_FILE = './data.json';

/* ---------------- EXPRESS SERVER (RENDER FIX) ---------------- */

const app = express();

app.get("/", (req, res) => {
    res.send("Bot is running.");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Web server started.");
});

/* ---------------- DISCORD CLIENT ---------------- */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

/* ---------------- DATABASE ---------------- */

let database = {
    autoLeave: false,
    approvedGuilds: []
};

if (fs.existsSync(DATA_FILE)) {
    try {
        database = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (err) {
        console.error("Failed to read database file. Using default.");
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2));
}

/* ---------------- READY ---------------- */

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = [
        {
            name: "toggleautoleave",
            description: "Toggle auto-leave mode (Bot Owner only)"
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log("Slash commands registered.");
    } catch (err) {
        console.error("Failed to register commands:", err);
    }
});

/* ---------------- INTERACTION HANDLER ---------------- */

client.on(Events.InteractionCreate, async (interaction) => {
    try {

        if (interaction.isChatInputCommand()) {

            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "Not allowed.", ephemeral: true });

            if (interaction.commandName === "toggleautoleave") {

                database.autoLeave = !database.autoLeave;
                saveData();

                return interaction.reply({
                    content: `Auto Leave is now: ${database.autoLeave ? "ON" : "OFF"}`,
                    ephemeral: true
                });
            }
        }

        if (interaction.isButton()) {

            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "Not allowed.", ephemeral: true });

            const [action, guildId] = interaction.customId.split("_");
            const guild = client.guilds.cache.get(guildId);

            if (!guild)
                return interaction.reply({ content: "Server not found.", ephemeral: true });

            if (action === "accept") {

                if (!database.approvedGuilds.includes(guildId)) {
                    database.approvedGuilds.push(guildId);
                    saveData();
                }

                return interaction.reply({
                    content: "✅ Server approved. Bot will stay.",
                    ephemeral: true
                });
            }

            if (action === "leave") {

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirmleave_${guildId}`)
                        .setLabel("Yes, Leave & Auto Leave Next Time")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(`leaveonce_${guildId}`)
                        .setLabel("Leave Only This Time")
                        .setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({
                    content: `Automatically leave this server next time?\nServer: ${guild.name}`,
                    components: [row],
                    ephemeral: true
                });
            }

            if (action === "confirmleave") {

                database.autoLeave = true;
                saveData();

                await guild.leave();

                return interaction.reply({
                    content: "❌ Left server and Auto Leave enabled.",
                    ephemeral: true
                });
            }

            if (action === "leaveonce") {

                await guild.leave();

                return interaction.reply({
                    content: "❌ Left server (Auto Leave unchanged).",
                    ephemeral: true
                });
            }
        }

    } catch (err) {
        console.error("Interaction error:", err);
    }
});

/* ---------------- GUILD JOIN EVENT ---------------- */

client.on('guildCreate', async (guild) => {

    if (database.autoLeave && !database.approvedGuilds.includes(guild.id)) {
        return guild.leave();
    }

    try {
        const owner = await client.users.fetch(OWNER_ID);

        let inviteLink = "No invite permission";

        const channel = guild.channels.cache
            .filter(c =>
                c.isTextBased() &&
                c.permissionsFor(guild.members.me)
                    ?.has(PermissionsBitField.Flags.CreateInstantInvite)
            )
            .first();

        if (channel) {
            try {
                const invite = await channel.createInvite({
                    maxAge: 0,
                    maxUses: 0
                });
                inviteLink = `https://discord.gg/${invite.code}`;
            } catch {}
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${guild.id}`)
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`leave_${guild.id}`)
                .setLabel("Leave")
                .setStyle(ButtonStyle.Danger)
        );

        await owner.send({
            content:
`🚨 New Server Invite

Server: ${guild.name}
Members: ${guild.memberCount}
Invite: ${inviteLink}

Do you want me to stay?`,
            components: [row]
        });

    } catch (err) {
        console.error("Failed to notify owner:", err);
    }
});

/* ---------------- LOGIN ---------------- */

client.login(process.env.TOKEN);
