const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// [إعدادات التعديل حسب سيرفرك]
const TOKEN = 'حط_التوكن_بتاع_البوت_هنا';
const PANEL_CHANNEL_ID = 'اي دي_قناة_اللوحة_الخاصة_بالليدر';
const ANNOUNCEMENT_CHANNEL_ID = 'اي دي_قناة_الإعلانات_الرسمية';

// خريطة لحفظ البيانات المؤقتة لكل مستخدم (النص + الحالة + الصورة لو وجدت)
const pendingAnnouncements = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || message.channel.id !== PANEL_CHANNEL_ID) return;

    // التأكد إن الشخص أدمن أو ليدر
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply({ content: '❌ عذراً، هذه القناة مخصصة لليدر والمسؤولين فقط!', ephemeral: true }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            message.delete().catch(() => {});
        });
    }

    const authorId = message.author.id;
    const userState = pendingAnnouncements.get(authorId);

    // لو المستخدم في حالة "انتظار رفع صورة" بعد الضغط على زرار إرفاق صورة
    if (userState && userState.step === 'waiting_for_image') {
        const attachment = message.attachments.first();
        if (!attachment) {
            await message.delete().catch(() => {});
            return message.channel.send({ content: `⚠️ من فضلك يا <@${authorId}> أرسل **صورة** صحيحة أو اضغط إلغاء.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 4000);
            });
        }

        // حفظ رابط الصورة وتحديث الحالة للجاهزية للنشر
        userState.imageUrl = attachment.url;
        userState.step = 'ready_to_publish';
        await message.delete().catch(() => {});

        // إعادة إظهار اللوحة بس بعد إضافة الصورة
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('publish_normal').setLabel('📤 إرسال عادي').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('publish_mention').setLabel('🔔 إرسال مع منشن').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('publish_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary)
            );

        return message.channel.send({
            content: `**تم إرفاق الصورة بنجاح! معاينة الإعلان:**\n> ${userState.text}\n🖼️ **تم إرفاق صورة**\n\n*اختر طريقة النشر:*`,
            components: [row]
        });
    }

    // الحالة العادية: كتابة إعلان جديد
    const announcementText = message.content;

    try {
        await message.delete();

        // تخزين النص وحالة البدء
        pendingAnnouncements.set(authorId, {
            text: announcementText,
            imageUrl: null,
            step: 'normal'
        });

        // الأزرار المحدثة (مضاف لها زرار إرفاق صورة)
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('publish_normal').setLabel('📤 إرسال عادي').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('publish_mention').setLabel('🔔 إرسال مع منشن').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('publish_image').setLabel('🖼️ إرفاق صورة').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('publish_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary)
            );

        await message.channel.send({
            content: `**معاينة الإعلان الخاص بك:**\n> ${announcementText}\n\n*اختر طريقة النشر أو أرفق صورة:*`,
            components: [row]
        });

    } catch (error) {
        console.error('حدث خطأ أثناء معالجة الإعلان:', error);
    }
});

// التعامل مع ضغطات الأزرار (Interaction)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const authorId = interaction.user.id;
    const userData = pendingAnnouncements.get(authorId);

    if (!userData) {
        return interaction.reply({ content: '⚠️ انتهت صلاحية هذا الإعلان أو تم تنفيذه مسبقاً.', ephemeral: true });
    }

    // لو اختار زرار "إرفاق صورة"
    if (interaction.customId === 'publish_image') {
        userData.step = 'waiting_for_image';
        return interaction.update({
            content: `🖼️ **أرسل الصورة الآن في هذه القناة** (سيتم ربطها بالإعلان تلقائياً)...`,
            components: []
        });
    }

    const announcementChannel = await interaction.guild.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);

    if (interaction.customId === 'publish_normal' || interaction.customId === 'publish_mention') {
        const useMention = interaction.customId === 'publish_mention';

        // إنشاء الـ Embed للإعلان مع دعم الصورة لو وجدت
        const embed = new EmbedBuilder()
            .setColor(useMention ? '#ff0000' : '#0099ff')
            .setTitle('📢 إعلان رسمي من الإدارة')
            .setDescription(userData.text)
            .setFooter({ text: `بواسطة: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        if (userData.imageUrl) {
            embed.setImage(userData.imageUrl);
        }

        // إرسال الإعلان لقناة الإعلانات
        if (announcementChannel) {
            await announcementChannel.send({
                content: useMention ? '@everyone @here إعلان هـام للجميع:' : '',
                embeds: [embed]
            });
        }

        pendingAnnouncements.delete(authorId);
        await interaction.update({ content: '✅ تم نشر الإعلان بنجاح (مع الصورة لو وجدت)!', components: [] });

    } else if (interaction.customId === 'publish_cancel') {
        pendingAnnouncements.delete(authorId);
        await interaction.update({ content: '❌ تم إلغاء نشر الإعلان.', components: [] });
    }
});

client.login(TOKEN);
