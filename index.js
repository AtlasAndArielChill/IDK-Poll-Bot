require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
} = require("discord.js");
const express = require("express");

// Get the channel ID from environment variables
const POLL_RESULTS_CHANNEL_ID = process.env.POLL_RESULTS_CHANNEL_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is online!");
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// A Map to store active polls and their questions
const activePolls = new Map();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Register the slash command
    const commands = [
        new SlashCommandBuilder()
            .setName("custompoll")
            .setDescription("Creates a custom poll")
            .addStringOption((option) =>
                option
                    .setName("question")
                    .setDescription("The question for the poll")
                    .setRequired(true),
            )
            .toJSON(),
    ];

    client.application.commands.set(commands);
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.isCommand()) {
        if (interaction.commandName === "custompoll") {
            const question = interaction.options.getString("question");

            // Create a unique custom ID for the button to store the question
            const buttonId = `start_poll_${interaction.id}`;

            // Create the button for the poll
            const button = new ButtonBuilder()
                .setCustomId(buttonId)
                .setLabel("Vote on this Poll")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            // Store the question with the interaction ID for later use
            activePolls.set(interaction.id, question);

            // Send the message with the button
            await interaction.reply({
                content: `**Poll:** ${question}`,
                components: [row],
            });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId.startsWith("start_poll_")) {
            const interactionId = interaction.customId.split("_")[2];
            const question = activePolls.get(interactionId);

            if (!question) {
                await interaction.reply({
                    content: "Sorry, this poll is no longer active!",
                    ephemeral: true,
                });
                return;
            }

            // Create the modal form
            const modal = new ModalBuilder()
                .setCustomId(`poll_modal_${interactionId}`)
                .setTitle(`Poll: ${question}`);

            const answerInput = new TextInputBuilder()
                .setCustomId("poll_answer")
                .setLabel("Your Answer")
                .setStyle(TextInputStyle.Short);

            const actionRow = new ActionRowBuilder().addComponents(answerInput);

            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("poll_modal_")) {
            const interactionId = interaction.customId.split("_")[2];
            const pollQuestion = activePolls.get(interactionId);
            const answer = interaction.fields.getTextInputValue("poll_answer");

            const resultsChannel = client.channels.cache.get(
                POLL_RESULTS_CHANNEL_ID,
            );
            if (resultsChannel) {
                // Send the poll answer to the designated channel
                resultsChannel.send(
                    `**Poll Answer Received:**\n**Question:** ${pollQuestion}\n**Answer:** ${answer}\n**User:** ${interaction.user.tag}`,
                );
            } else {
                console.error("Poll results channel not found!");
            }

            await interaction.reply({
                content: "Your vote has been submitted!",
                ephemeral: true,
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
