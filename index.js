const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    ChannelType, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    InteractionType,
    PermissionsBitField,
    REST,
    Routes
} = require('discord.js');
// --- EXPRESS IMPORTS ---
const express = require('express');

// --- Configuration and Client Initialization ---

// Replace with your actual Bot Token and Client ID
const TOKEN = 'YOUR_BOT_TOKEN'; // e.g., process.env.DISCORD_TOKEN
const CLIENT_ID = 'YOUR_CLIENT_ID'; // e.g., process.env.CLIENT_ID
// Replace with the Guild ID (Server ID) where you want to test the command immediately
const GUILD_ID = 'YOUR_GUILD_ID'; 

// --- EXPRESS SERVER SETUP ---
// Use environment variable PORT if available (common for hosting platforms) or default to 3000
const PORT = process.env.PORT || 3000;
const app = express();

// A simple GET route to keep the server alive and/or provide a status check
app.get('/', (req, res) => {
    res.send('Discord Bot is Online!');
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
// ------------------------------

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ] 
});

// --- Command Definition and Registration Script (UNMODIFIED) ---

const CUSTOM_POLL_COMMAND = new SlashCommandBuilder()
    .setName('custompoll')
    .setDescription('Creates a custom poll with an opinion form.')
    .addStringOption(option =>
        option.setName('title')
            .setDescription('The title for the poll embed.')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('question')
            .setDescription('The question for the poll.')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('duration')
            .setDescription('Duration of the poll.')
            .setRequired(true)
            .addChoices(
                { name: '1 Hour', value: '1h' },
                { name: '1 Day', value: '1d' },
                { name: '1 Week', value: '1w' }
            ))
    .addChannelOption(option =>
        option.setName('results_channel')
            .setDescription('The channel to send the poll opinions to.')
            .addChannelTypes(ChannelType.GuildText) // Only allow text channels
            .setRequired(true))
    .toJSON();


async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log(`Started refreshing application (/) commands for guild ${GUILD_ID}.`);

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: [CUSTOM_POLL_COMMAND] },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error("Error registering commands:", error);
    }
}

// --- Event Handlers (UNMODIFIED) ---

client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    // Register the commands when the bot is ready
    registerCommands(); 
});

client.on('interactionCreate', async interaction => {
    
    // --- 1. Handle the Slash Command /custompoll ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'custompoll') {
            const title = interaction.options.getString('title');
            const question = interaction.options.getString('question');
            const duration = interaction.options.getString('duration');
            const resultsChannel = interaction.options.getChannel('results_channel');

            // --- IMPORTANT SECURITY CHECK ---
            if (!resultsChannel.permissionsFor(client.user).has(PermissionsBitField.Flags.SendMessages)) {
                return interaction.reply({ 
                    content: `I do not have permission to send messages in the specified results channel ${resultsChannel}.`, 
                    ephemeral: true 
                });
            }

            const buttonCustomId = `pollButton_${resultsChannel.id}`;

            const pollEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(title)
                .setDescription(`**Question:** ${question}\n\n*Click the button below to share your opinion.*`)
                .addFields({ name: 'Opinion Submissions Sent To', value: `${resultsChannel}`, inline: false})
                .setFooter({ text: `Duration: ${duration}` })
                .setTimestamp();

            const opinionButton = new ButtonBuilder()
                .setCustomId(buttonCustomId)
                .setLabel('Share Opinion')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(opinionButton);

            await interaction.reply({ 
                embeds: [pollEmbed], 
                components: [row] 
            });
            return;
        }
    }

    // --- 2. Handle the Button Click (Show Modal) ---
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('pollButton_')) {
            const [_, resultsChannelId] = interaction.customId.split('_');
            const pollMessageId = interaction.message.id;
            const pollTitle = interaction.message.embeds[0].title;
            
            const modalCustomId = `opinionModal_${pollMessageId}_${resultsChannelId}`;

            const modal = new ModalBuilder()
                .setCustomId(modalCustomId)
                .setTitle(`Your Opinion on: ${pollTitle.substring(0, 45)}...`); 

            const opinionInput = new TextInputBuilder()
                .setCustomId('opinionInput')
                .setLabel('Your Opinion')
                .setStyle(TextInputStyle.Paragraph) 
                .setRequired(true)
                .setMinLength(10)
                .setMaxLength(1000); 

            const firstActionRow = new ActionRowBuilder().addComponents(opinionInput);

            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
            return;
        }
    }

    // --- 3. Handle the Modal Submission (Send Opinion) ---
    if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId.startsWith('opinionModal_')) {
            const [_, pollMessageId, resultsChannelId] = interaction.customId.split('_');

            const opinionText = interaction.fields.getTextInputValue('opinionInput');
            
            const originalTitle = interaction.message?.embeds[0]?.title || 'Unknown Poll';

            const resultsChannel = client.channels.cache.get(resultsChannelId);

            if (!resultsChannel) {
                return interaction.reply({ content: 'Error: The designated results channel could not be found.', ephemeral: true });
            }

            const opinionEmbed = new EmbedBuilder()
                .setColor('#32a852')
                .setTitle(`New Opinion for: ${originalTitle}`)
                .setURL(interaction.message.url) 
                .setDescription(`**Submitted by:** ${interaction.user.tag} (<@${interaction.user.id}>)`)
                .addFields(
                    { name: 'Opinion', value: opinionText.substring(0, 1024) }
                )
                .setTimestamp();

            try {
                await resultsChannel.send({ embeds: [opinionEmbed] });

                await interaction.reply({ 
                    content: `Thank you! Your opinion has been successfully submitted and sent to ${resultsChannel}.`, 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Error sending opinion:', error);
                await interaction.reply({ 
                    content: 'A system error occurred while sending your opinion. Please check bot permissions.', 
                    ephemeral: true 
                });
            }
            return;
        }
    }
});

// --- Login to Discord ---
client.login(TOKEN);
