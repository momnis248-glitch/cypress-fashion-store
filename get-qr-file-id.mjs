// Run only on your own computer or server: BOT_TOKEN="..." node get-qr-file-id.mjs
// First, send the payment QR image to @Cypress11_bot from a private chat.
if(!process.env.BOT_TOKEN)throw new Error('Set BOT_TOKEN in the environment first.');
const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getUpdates`);
const data=await response.json();
const photos=data.result.flatMap(update=>update.message?.photo||[]);
const fileId=photos.at(-1)?.file_id;
if(!fileId)throw new Error('No photo was found. Send the QR image to the bot, then run this command again.');
console.log(`PAYMENT_QR_FILE_ID=${fileId}`);
