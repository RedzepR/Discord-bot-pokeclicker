const { EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const { modLog } = require('../other/mod/functions.js');

module.exports = {
  name        : 'art-contributor',
  aliases     : [],
  description : 'Apply the @Art Contributor role to a user',
  args        : [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'User to apply the role to',
      required: true,
    },
  ],
  guildOnly   : true,
  cooldown    : 3,
  botperms    : ['SendMessages', 'EmbedLinks', 'ManageRoles'],
  userroles   : ['Developer', 'Moderator'],
  execute     : async (interaction, args) => {
    const id = interaction.options.get('user').value;

    const member = await interaction.guild.members.fetch(id).catch(e => {});
    if (!member) {
      const embed = new EmbedBuilder().setColor('#e74c3c').setDescription('Invalid user ID specified.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const role = member.guild.roles.cache.find(role => role.name === 'Art Contributor');

    if (!role) {
      const embed = new EmbedBuilder().setColor('#e74c3c').setDescription('Art Contributor role not found,\ntry again later..');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (member == interaction.guild.members.me) {
      modLog(interaction.guild,
        `**Mod:** ${interaction.member.toString()}
        **User:** ${member.toString()} (${member.id})
        **Action:** Attempted to apply ${role} to the bot`);
      const embed = new EmbedBuilder().setColor('#e74c3c').setDescription('You cannot apply that role to me trainer!');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const output = [`Thank you ${member} for your contributions to the game,\nCongratulations on ${role}!`];

    await member.roles.add(role, `Role applied by ${interaction.member.displayName}-${interaction.user.id}`);

    const embed = new EmbedBuilder().setColor('#3498db').setDescription(output.join('\n'));

    modLog(interaction.guild,
      `**Mod:** ${interaction.member.toString()}
      **User:** ${member.toString()} (${member.id})
      **Action:** Applied ${role}`);

    interaction.reply({ embeds: [embed] });
  },
};
