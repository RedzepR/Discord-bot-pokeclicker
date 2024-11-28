const { EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const {
  DailyDeal,
  UndergroundItem,
  dateToString,
  gameVersion,
  UndergroundItemValueType,
} = require('../helpers.js');

module.exports = {
  name        : 'dailychain',
  aliases     : ['dc', 'dailychains', 'chain', 'chains', 'daily-chain'],
  description : 'Get a list of the best daily chains for the next 14 days',
  args        : [
    {
      name: 'max-slots',
      type: ApplicationCommandOptionType.Integer,
      description: 'Maximum number of slots you have unlocked in the Underground (default 5)',
      required: false,
    },
    {
      name: 'days',
      type: ApplicationCommandOptionType.Integer,
      description: 'Maximum number of days would you like to complete a chain for (default 14)',
      required: false,
    },
    {
      name: 'from-date',
      type: ApplicationCommandOptionType.String,
      description: 'YYYY-MM-DD - Starting date for the daily chain (default today UTC)',
      required: false,
    },
  ],
  guildOnly   : true,
  cooldown    : 3,
  botperms    : ['SendMessages', 'EmbedLinks'],
  userperms   : [],
  channels    : ['bot-commands'],
  execute     : async (interaction) => {
    let [
      maxSlots,
      fromDate,
      days,
    ] = [
      +interaction.options.get('max-slots')?.value || 5,
      interaction.options.get('from-date')?.value,
      +interaction.options.get('days')?.value || 14,
    ];

    if (isNaN(maxSlots) || maxSlots <= 0 || maxSlots > 5) {
      maxSlots = 3;
    }

    if (fromDate) {
      if (!/\d{4}-\d{2}-\d{2}/.test(fromDate)) return interaction.reply(`Invalid from date specified: \`${fromDate}\`\nMust be \`YYYY-MM-DD\` format`, { ephemeral: true });
      fromDate = fromDate.split('-');
      fromDate[1]--;
      fromDate = new Date(fromDate[0], fromDate[1], fromDate[2]);
    } else {
      const today = new Date();
      // go to yesterday
      fromDate = new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), today.getUTCHours() - 13);
    }

    days = Math.max(1, Math.min(1000, days));

    const embed = new EmbedBuilder()
      .setTitle(`(Depreciated) Upcoming Daily Deals (${maxSlots} slots - ${days} days)`)
      .setColor('#3498db')
      .setFooter({ text: `Daily deals are depreciated as of v0.10.21` });

    // Calculate name padding
    const allItemsLength = UndergroundItem.list.map(item => item.name.length);
    const padding = Math.max(...allItemsLength);

    class DealProfit {
      constructor(type, amount) {
        this.type = type;
        this.amount = amount;
      }
    }

    const calculateProfit = (deal) => {
      if (deal.item1.valueType != UndergroundItemValueType.Diamond) deal.item1.value = 0;
      if (deal.item2.valueType != UndergroundItemValueType.Diamond) deal.item2.value = 0;
      if (deal.item1.value || deal.item2.value) {
      // An item is worth diamonds
        const profit = (deal.item2.value * deal.amount2) - (deal.item1.value * deal.amount1);
        return new DealProfit('diamond', profit);
      } else {
      // Neither item is worth diamonds
        const profit = deal.amount2 - deal.amount1;
        return new DealProfit('item', profit);
      }
    };

    const getDealsList = (fromDate, totalDays = 14, maxDeals = 5) => {
      const dealsList = [];
      for (let i = 0; i < totalDays; i++) {
        const date = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
        DailyDeal.generateDeals(maxDeals, date);
        dealsList.push([...DailyDeal.list].map(deal => {
          deal.profit = calculateProfit(deal);
          deal.date = date;
          return deal;
        }));
      }
      return dealsList;
    };

    const dailyDeals = getDealsList(fromDate, days, maxSlots).flatMap(deals =>
      // when processing deals, we want to make sure all possible links
      // have been processed. Sometimes, there is a deal on the same day
      // which we can link to, so we sort the deals within each day to
      // make sure those linkables have been processed
      deals.sort((a, b) => {
        // if `b` can link to `a`, `a` should sort after `b` (and vice versa)
        if (a.item1 == b.item2) return 1;
        if (b.item1 == a.item2) return -1;

        // if `a` can be linked from something sort `a` after `b`
        if (deals.find(x => a.item1 == x.item2)) return 1;
        // if `b` can be linked from something, sort `a` before `b`
        if (deals.find(x => b.item1 == x.item2)) return -1;

        return 0;
      })
    );

    const chainList = [];
    let worstProfitInList = 0;
    const maxChains = 20;

    const addChain = (start) => {
      const profit = start.profit - start.deal.item1.value;
      if (profit > worstProfitInList) {
        const chain = [];
        let link = start;

        while (link != undefined) {
          chain.push(link.deal);
          link = chains.list[link.next];
        }

        chainList.push({profit: profit, deals: chain});
        chainList.sort((a,b) => (b.profit - a.profit));
        if (chainList.length > maxChains) {
          chainList.pop();
          worstProfitInList = chainList[chainList.length - 1].profit;
        }
      }
    };

    const betterToSell = (deal, next) => {
      // If we wouldn't get diamonds from selling item2, we only stand to gain
      const isDia = deal.amount2 < 100 && deal.amount2 > 0;

      // If we would be better off selling item2 of this deal,
      // then we shouldn't suggest feeding it into the chain
      return (isDia && next.profit < deal.item2.value);
    };

    const chains = dailyDeals.reduceRight((res,deal) => {
      // Link to the best future deal
      let next = res.bestStartingWith[deal.item2.name];

      // Don't link to a bad chain
      if (next != undefined && betterToSell(deal, res.list[next])) {
        next = undefined;
      }

      const chainlink = {deal: deal, next: next, linkedFrom: []};
      const index = res.list.length;

      // Calculate chain value from this deal
      if (next != undefined) {
        const nextlink = res.list[next];
        nextlink.linkedFrom.push(index);
        chainlink.profit = nextlink.profit * deal.amount2 / deal.amount1;
      } else {
        const val = (deal.item2.value > 100 || deal.item2.value < 0) ? 0 : deal.item2.value;
        chainlink.profit = val * deal.amount2 / deal.amount1;
      }

      // update bestStartingWith
      const bestItem1 = res.list[res.bestStartingWith[deal.item1.name]];
      if (chainlink.profit > 0 && (!bestItem1 || bestItem1.profit < chainlink.profit)) {
        res.bestStartingWith[deal.item1.name] = index;
      }

      res.list.push(chainlink);
      return res;
    }, { bestStartingWith: {}, list: [] });

    // build chainList
    // only add chains using the start, ie those that aren't linkedFrom anything
    chains.list.forEach(link => link.linkedFrom.length || addChain(link));

    let tooLong = false;
    chainList.forEach(chain => {
      if (tooLong) return;
      // Our data
      const deals = chain.deals;
      const profit = +chain.profit.toFixed(1);
      // Title
      const title = `❯ ${dateToString(deals[0].date)} → ${dateToString(deals[deals.length - 1].date)}`;
      const description = `Profit per 1 of initial investment \`💎 ${profit.toLocaleString('en-US')}\``;
      if (embed.length + title.length + description.length >= 5950) {
        return tooLong = true;
      }
      embed.addFields({
        name: title,
        value:  description,
      });

      // Deals Output
      const dates = [];
      const deal_output1 = [];
      const deal_output2 = [];
      deals.forEach(deal => {
        dates.push(`[${dateToString(deal.date)}]`);
        deal_output1.push(`[${deal.amount1}] ${deal.item1.name.padEnd(padding, ' ')}`);
        deal_output2.push(`[${deal.amount2}] ${deal.item2.name}`);
      });

      while (deals.length) {
        const max_size = Math.floor(1024 / (`${deal_output1[2]}\n`).length) - 1;
        deals.splice(0, max_size);
        const date_str = ['```ini', ...dates.splice(0, max_size), '```'].join('\n');
        const deal_1_str = ['```ini', ...deal_output1.splice(0, max_size), '```'].join('\n');
        const deal_2_str = ['```ini', ...deal_output2.splice(0, max_size), '```'].join('\n');
        if (embed.length + date_str.length + deal_1_str.length + deal_2_str.length + 50 /* account for title + too long message lengths */ >= 6000 || embed.data.fields.length >= 21) {
          embed.addFields({
            name: '...chain length too long...',
            value:  '\u200b',
            inline: false,
          });
          return tooLong = true;
        }
        embed.addFields({
          name: '_Date_',
          value:  date_str,
          inline: true,
        });
        embed.addFields({
          name: '_Give_',
          value:  deal_1_str,
          inline: true,
        });
        embed.addFields({
          name: '_Receive_',
          value:  deal_2_str,
          inline: true,
        });
      }
    });


    interaction.reply({ embeds: [embed] });
  },
};
