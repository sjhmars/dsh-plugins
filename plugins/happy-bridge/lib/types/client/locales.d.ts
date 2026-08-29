/** Locale namespace owned by the Happy remote settings card. */
export declare const NS = "happy-bridge";
/** Simplified-Chinese copy. */
export declare const zh: {
    readonly title: "Happy 远程";
    readonly description: "用手机 Happy App 遥控已经在跑的对话。";
    readonly expand: "展开";
    readonly collapse: "收起";
    readonly 'status.unpaired': "还没配对";
    readonly 'status.pairing': "等待手机扫码…请在 Happy App 里扫，不要用系统相机。";
    readonly 'status.paired': "已连接到 Happy";
    readonly 'status.linked': "已接通对话";
    readonly 'qr.alt': "Happy 配对二维码";
    readonly 'copy.mobile': "复制手机链接";
    readonly 'copy.web': "复制网页链接";
    readonly copied: "已复制";
    readonly start: "开始配对";
    readonly repair: "重新配对";
    readonly disconnect: "断开";
    readonly grant: "手机能管多深";
    readonly 'grant.watch': "只看";
    readonly 'grant.chat': "能聊";
    readonly 'grant.approve': "能批";
    readonly 'grant.full': "完整";
    readonly 'grant.hint': "改成「完整」后，手机换模型和思考强度会同步到电脑。电脑上换也会同步到手机。";
    readonly readOnly: "这份设置现在不能改。";
    readonly enabled: "启用";
    readonly error: "出错";
};
/** English copy. */
export declare const en: Record<keyof typeof zh, string>;
/** Stable locale keys. */
export type HappyBridgeKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map