require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const Web3 = require("web3");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const usedTxFile = "used_txhashes.json";
if (!fs.existsSync(usedTxFile)) fs.writeFileSync(usedTxFile, "[]");
const USED_TX_FILE = "used_txhashes.json";

// ✅ Bot and Web3 Init
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const web3 = new Web3(process.env.RPC_URL);

// ✅ Constants
const ADMIN_ID = process.env.ADMIN_ID;
const GROUP_ID = process.env.GROUP_ID;
const WALLET = "0xC421E42508269556F0e19f2929378aA7499CD8Db".toLowerCase();
const USDT_CONTRACT = "0x55d398326f99059f775485246999027b3197955".toLowerCase();
const SUBSCRIPTIONS_FILE = "subscriptions.json";

// ✅ File create if not exists
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({}));
}

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Crypto BD Bot is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      keyboard: [
        ["💰 Buy Subscription"],
        ["📊 My Subscriptions"],
        ["✨ Benefit Of Subscription", "📞 HelpLine"],
      ],
      resize_keyboard: true,
    },
  };
  bot.sendMessage(chatId, `👋 Welcome to *Crypto BD Subscriptions Bot*!`, {
    parse_mode: "Markdown",
    ...opts,
  });
});

// Message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "💰 Buy Subscription") {
    bot.sendMessage(chatId, `Choose a package:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🗓 Monthly ($2)", callback_data: "buy_monthly" },
            { text: "📅 Yearly ($15)", callback_data: "buy_yearly" },
          ],
        ],
      },
    });
  } else if (text === "📊 My Subscriptions") {
    const subscriptions = loadSubscriptions();
    const sub = subscriptions[chatId];

    const expiry = sub?.expiry || sub?.expiresAt;

    if (sub && expiry && new Date(expiry) > new Date()) {
      const timeLeft = Math.ceil(
        (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24),
      );
      const message =
        `✅ আপনার একটি সক্রিয় *${sub.package}* প্যাকেজ রয়েছে!\n` +
        `📅 মেয়াদ শেষ হবে: *${new Date(expiry).toLocaleDateString("bn-BD")}*\n` +
        `⏳ বাকি দিন: *${timeLeft}* দিন`;

      bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } else {
      bot.sendMessage(chatId, `❌ আপনার কোন সক্রিয় সাবস্ক্রিপশন নেই`);
    }
  } else if (text && /^0x[a-fA-F0-9]{64}$/.test(text.trim())) {
    const txHash = text.trim();
    const userId = msg.from.id;
    bot.sendMessage(chatId, `⏳ Verifying transaction...`);

    try {
      const result = await verifyTransaction(
        txHash,
        userId,
        chatId,
        "monthly",
        bot,
      );

      if (!result.success) {
        return bot.sendMessage(chatId, `❌ ${result.message}`);
      }

      const packageType = result.amount >= 15 ? "Yearly" : "Monthly";
      const durationDays = packageType === "Yearly" ? 365 : 30;

      const subscriptions = loadSubscriptions();
      const now = new Date();
      const expiry = new Date(
        now.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );

      subscriptions[chatId] = {
        txHash,
        package: packageType,
        startDate: now.toISOString(),
        endDate: expiry.toISOString(),
        expiry,
        active: true,
      };

      saveSubscriptions(subscriptions);

      bot.sendMessage(
        chatId,
        `✅ Subscription activated!\n\n📦 Package: ${packageType}\n📅 Valid till: ${expiry.toDateString()}`,
      );
      bot.sendMessage(
        ADMIN_ID,
        `🆕 New subscriber:\nUser: ${msg.from.username || chatId}\nPackage: ${packageType}\nTxHash: ${txHash}`,
      );
    } catch (err) {
      console.error(err);
      bot.sendMessage(
        chatId,
        `❌ Error verifying transaction. Try again later.`,
      );
    }
  } else if (text === "✨ Benefit Of Subscription") {
    bot.sendMessage(
      chatId,
      `📜 *CBDB Subscription নিয়মাবলী ও সুবিধাসমূহ:*\n\n*✅ সাবস্ক্রিপশন নিয়মাবলী:*  \n১) প্রতেক ইউজারকে মাসিক $2 অথবা বাৎসরিক $15 সাবস্ক্রিপশন ফি দিতে হবে (অফেরতযোগ্য)।  \n২) প্রতেক এডমিনদের আলোচনা সাপেক্ষে কিছু ডলার জমা দিতে হবে (যা পরে ফেরত দেওয়া হবে)।  \n৩) প্রতি মাসের ১ তারিখ হতে হিসাব শুরু হবে।  \n৪) যারা বাৎসরিক সাবস্ক্রিপশন নিবেন, তারা $10 এর কম যেকোনো ডিল নিজেরাই করতে পারবেন (এডমিন ছাড়া)।  \n৫) আপনি যে গ্রুপের সাবস্ক্রিপশন নিবেন, শুধুমাত্র সেই গ্রুপেই সুযোগ সুবিধা পাবেন।\n\n🗞️ *রিজার্ভ ফান্ড এর ব্যাবহার:*  \n🔹 ২৫% – এডমিনদের মাঝে বিতরণ  \n🔹 ১৫% – ইউজারদের গিভঅ্যাওয়ের মাধ্যমে  \n🔹 ১০% – সমাজসেবা, গরীব/অসহায় বা ধর্মীয় কাজে  \n🔹 ৫০% – গ্রুপের নিরাপত্তার ব্যাকআপ ফান্ড\n\n👉 *সাবস্ক্রিপশন এর সুবিধা:*  \n1) ১০০% নিরাপদে বাই সেল সুবিধা  \n2) সবসময় এক্টিভ এডমিন সাপোর্ট  \n3) $10 এর কম ডিল এডমিন ছাড়া করতে পারবেন (বাৎসরিক প্যাকেজে)  \n4) যদি স্ক্যাম হয়, ২৪ ঘন্টার মধ্যে ক্ষতিপূরণ  \n5) প্রতি মাসে $1-$5 পর্যন্ত লটারি জেতার সুযোগ\n\n🚫 *সতর্কতামূলক কিছু কথা:*  \n🔸 ইনবক্সে ডিলে স্ক্যাম হলে গ্রুপ দায় নেবে না  \n🔸 এডমিনের ডলার লিমিট মেনে চলবেন – ভুলেও বেশি দিয়ে পাকনামি করবেন না  \n🔸 পাকনামি ধরা পড়লে, দায় দায়িত্ব সম্পূর্ণ নিজের\n\n🛡️ নিরাপত্তা নিশ্চিত করতে CBDB অ্যাডমিন টিম সর্বোচ্চ প্রচেষ্টা নিয়ে কাজ করছে।  \n✅ সাবস্ক্রিপশন করুন, নিরাপদে লেনদেন করুন।`,
      { parse_mode: "Markdown" },
    );
  } else if (text === "📞 HelpLine") {
    const message = `
*📞 Support Contact*

আপনি যেকোনো সমস্যার জন্য আমাদের হেল্পলাইনে যোগাযোগ করতে পারেন:

👤 @Jebon111  
⏰ সময়: ২৪/৭ উপলব্ধ
`;
    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }
});

// Callback for package buttons
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const price = data === "buy_monthly" ? 2 : 15;

  bot.sendMessage(
    chatId,
    `Send *${price} USDT (BEP20)* to this wallet:\n\n💼 \`${WALLET}\`\n\nAfter payment, reply with your *transaction hash (txhash)*.`,
    { parse_mode: "Markdown" },
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === "supergroup" || msg.chat.type === "group";

  if (!isGroup) return; // শুধু গ্রুপ মেসেজ চেক করবে

  const subscriptions = loadSubscriptions();
  const sub = subscriptions[userId];

  const isAdmin = await bot.getChatAdministrators(chatId)
    .then(admins => admins.some(admin => admin.user.id === userId))
    .catch(() => false);

  const now = new Date();

  if (isAdmin) return; // অ্যাডমিনদের কিছু বলবে না

  if (!sub || !sub.active || new Date(sub.expiry) < now) {
    // মিউট করে দিবে
    await bot.restrictChatMember(chatId, userId, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // ১ বছর
    });

    await bot.sendMessage(chatId, `⛔ @${msg.from.username || "user"}, আপনার অ্যাক্টিভ সাবস্ক্রিপশন নেই, তাই আপনাকে মিউট করা হয়েছে। সাবস্ক্রিপশন নিতে /start চাপুন।`, {
      reply_to_message_id: msg.message_id,
    });
  }
});



// verifyTransaction(txhash, userId, chatId, packageType
// ✅ Load subs
function loadSubscriptions() {
  return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE));
}

// ✅ Save subs
function loadSubscriptions() {
  if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE));
}

function saveSubscriptions(data) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
}

function loadUsedTxHashes() {
  if (!fs.existsSync(USED_TX_FILE)) {
    fs.writeFileSync(USED_TX_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(USED_TX_FILE));
}

function saveUsedTxHashes(hashes) {
  fs.writeFileSync(USED_TX_FILE, JSON.stringify(hashes, null, 2));
}

// ✅ Verify Transaction
async function verifyTransaction(txhash, userId, chatId, packageType, bot) {
  try {
    const response = await axios.post(process.env.RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txhash],
      id: 1,
    });

    const receipt = response.data.result;

    if (!receipt) {
      await bot.sendMessage(
        chatId,
        "⛔ ট্রানজেকশন এখনো কনফার্ম হয়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      );
      return { success: false, message: "⛔ ট্রানজেকশন এখনো কনফার্ম হয়নি।" };
    }

    const logs = receipt.logs;
    const transferLog = logs.find(
      (log) =>
        log.topics[0] === web3.utils.sha3("Transfer(address,address,uint256)"),
    );

    if (!transferLog) {
      await bot.sendMessage(
        chatId,
        "⛔ এই ট্রানজেকশনে কোন Transfer ইভেন্ট পাওয়া যায়নি।",
      );
      return {
        success: false,
        message: "⛔ কোন Transfer ইভেন্ট পাওয়া যায়নি।",
      };
    }

    const toAddress = "0x" + transferLog.topics[2].slice(26);
    const valueHex = transferLog.data;
    const value = parseInt(valueHex, 16) / 10 ** 18;

    const expectedAmount = packageType === "monthly" ? 2 : 15;

    if (toAddress.toLowerCase() !== WALLET.toLowerCase()) {
      await bot.sendMessage(chatId, "⛔ টাকা সঠিক ওয়ালেটে পাঠানো হয়নি।");
      return { success: false, message: "⛔ ভুল ওয়ালেটে পাঠানো হয়েছে।" };
    }

    if (value < expectedAmount) {
      await bot.sendMessage(
        chatId,
        `⛔ আপনি যথেষ্ট ইউএসডিটি (${expectedAmount} USDT) পাঠাননি।`,
      );
      return {
        success: false,
        message: `⛔ ${expectedAmount} USDT কম পাঠানো হয়েছে।`,
      };
    }

    // ✅ Load subscriptions & used hashes
    const subscriptions = loadSubscriptions();
    const usedTxs = loadUsedTxHashes();

    // 🔁 Check if already used
    if (usedTxs.includes(txhash)) {
      await bot.sendMessage(chatId, "⛔ এই TxHash আগে ব্যবহার করা হয়েছে।");
      return { success: false, message: "⛔ TxHash ইতিমধ্যে ব্যবহৃত হয়েছে।" };
    }

    // 🕒 Set duration
    const now = new Date();
    const endDate = new Date(now);
    if (packageType === "monthly") endDate.setMonth(endDate.getMonth() + 1);
    else endDate.setFullYear(endDate.getFullYear() + 1);

    // ✅ Save subscription
    subscriptions[userId] = {
      txhash,
      package: packageType,
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      expiry: endDate.toISOString(),
      active: true,
      chatId,
    };


    // ✅ Save both files
    saveSubscriptions(subscriptions);
    usedTxs.push(txhash);
    saveUsedTxHashes(usedTxs);

    // ✅ Confirmation message
    await bot.sendMessage(
      chatId,
      `✅ সাবস্ক্রিপশন সফলভাবে একটিভ হয়েছে!\n📦 প্যাকেজ: ${packageType}\n🗓 মেয়াদ শেষ: ${endDate.toDateString()}`,
    );
    try {
  const member = await bot.getChatMember(GROUP_ID, userId);
  const isAdmin = ["administrator", "creator"].includes(member.status);

  if (!isAdmin) {
    await bot.restrictChatMember(GROUP_ID, parseInt(userId), {
      permissions: {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false
      }
    });

    await bot.sendMessage(chatId, "🔓 আপনি এখন গ্রুপে মেসেজ পাঠাতে পারবেন!");
  }
} catch (e) {
  console.error("Unmute Error:", e.message);
}
    await bot.sendMessage(
      ADMIN_ID,
      `👤 নতুন সাবস্ক্রিপশন:\n🆔 User ID: ${userId}\n💸 প্যাকেজ: ${packageType}\n🔗 TxHash: ${txhash}`,
    );

    return { success: true };
  } catch (error) {
    console.error("verifyTransaction error:", error);
    await bot.sendMessage(
      chatId,
      "⛔ একটি ত্রুটি ঘটেছে। দয়া করে পরে আবার চেষ্টা করুন।",
    );
    return { success: false, message: "⛔ একটি ত্রুটি ঘটেছে।" };
  }
}

// ✅ User command (only one!)
bot.onText(/\/verify (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const txhash = match[1];
  const packageType = "monthly"; // Future dynamic

  await bot.sendMessage(chatId, "⏳ Verifying transaction...");

  const result = await verifyTransaction(
    txhash,
    userId,
    chatId,
    packageType,
    bot,
  );

  if (!result.success) {
    return bot.sendMessage(chatId, `❌ ${result.message}`);
  }
});

// ✅ Expiry checker (every hour)
setInterval(async () => {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return;

    const subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE));
    const now = new Date();

    for (const userId in subscriptions) {
      const sub = subscriptions[userId];
      const expiry = new Date(sub.expiry);
      if (now > expiry && sub.active) {
  sub.active = false;

  bot.sendMessage(
    userId,
    "⚠️ আপনার সাবস্ক্রিপশন মেয়াদ শেষ হয়ে গেছে। নতুন করে প্যাকেজ কিনুন।"
  );

  try {
    await bot.restrictChatMember(GROUP_ID, parseInt(userId), {
      permissions: {
        can_send_messages: false
      }
    });

    await bot.sendMessage(userId, "🔇 আপনার সাবস্ক্রিপশন মেয়াদ শেষ হওয়ায় আপনি মেসেজ পাঠাতে পারবেন না। সাবস্ক্রিপশন নবায়ন করে পুনরায় অ্যাক্সেস পান।");
  } catch (e) {
    console.log("Mute error:", e.message);
  }
}


    fs.writeFileSync(
      SUBSCRIPTIONS_FILE,
      JSON.stringify(subscriptions, null, 2),
    );
  }
  
  60 * 60 * 1000,
); // প্রতি ১ ঘণ্টা পর চেক করবে

app.get("/", (req, res) => {
  res.send("🤖 Telegram Bot is running...");
});

app.listen(3000, () => {
  console.log("🌐 HTTP server running on port 3000");
});
