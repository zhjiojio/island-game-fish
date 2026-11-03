# 《我的未婚妻》节点地图（自动生成）

> 生成时间：9/17/2026, 2:30:03 AM
> 源文件：`js/story.js`，共 **252** 个节点

> **用法**：想改某节点前先看这个地图。每个节点写明 `js/story.js:LINE` 行号，直接跳过去改。

## 快速索引

- [EP01（39 节点）](#ep01)
- [EP02（104 节点）](#ep02)
- [EP03（44 节点）](#ep03)
- [EP04（20 节点）](#ep04)
- [EP05（30 节点）](#ep05)
- [EP99（15 节点）](#ep99)

---

## EP01

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `op1` | 306 | video | 梦中女主播 | `⚡/op1_final20s.mp4` | `f_op1_outfit` | — |
| `f_op1_outfit` | 307 | choice | — | `images/lastframes/op1.v2.jpg` | `s_op1_lace`<br/>`s1` | `op1` |
| `s_op1_lace` | 308 | video | 梦中女主播 | `⚡/lace_confess_final.mp4` | `s1` | `f_op1_outfit` |
| `s1` | 309 | video | 傲天 | `⚡/S1a.dream.mp4` | `f_dream_more` | `f_op1_outfit`<br/>`s_op1_lace` |
| `f_dream_more` | 310 | choice | — | `images/lastframes/S1a.dream.jpg` | `s_dream_yujie`<br/>`s_dream_xinggan`<br/>`s_dream_zhixing`<br/>`s1b` | `s1`<br/>`s_dream_yujie`<br/>`s_dream_xinggan`<br/>`s_dream_zhixing` |
| `s_dream_yujie` | 311 | video | 傲天 | `⚡/dream_yujie.v1.mp4` | `f_dream_more` | `f_dream_more` |
| `s_dream_xinggan` | 312 | video | 傲天 | `⚡/dream_xinggan.v1.mp4` | `f_dream_more` | `f_dream_more` |
| `s_dream_zhixing` | 313 | video | 傲天 | `⚡/dream_zhixing.v1.mp4` | `f_dream_more` | `f_dream_more` |
| `s1b` | 314 | video | 傲天 | `⚡/S1b.crash.mp4` | `s2` | `f_dream_more` |
| `s2` | 315 | video | 你（内心） | `⚡/S2.hd.mp4` | `f_s2` | `s1b` |
| `f_s2` | 316 | choice | — | `⚡/f_s2_a.png` | `r_f_s2_a`<br/>`r_f_s2_b`<br/>`r_f_s2_c` | `s2` |
| `r_f_s2_a` | 317 | image | 你（内心） | `⚡/f_s2_a.png` | `s3` | `f_s2` |
| `r_f_s2_b` | 318 | image | 你（内心） | `⚡/f_s2_b.png` | `s3` | `f_s2` |
| `r_f_s2_c` | 319 | image | 你（内心） | `⚡/f_s2_c.png` | `s3` | `f_s2` |
| `s3` | 320 | video | 沈婉儿（哽咽） | `⚡/S3.hd.mp4` | `f0` | `r_f_s2_a`<br/>`r_f_s2_b`<br/>`r_f_s2_c` |
| `f0` | 321 | choice | — | `images/lastframes/S3.hd.jpg` | `r_f0_a`<br/>`r_f0_b`<br/>`r_f0_c`<br/>`BE_STARVE` | `s3` |
| `r_f0_a` | 322 | image | 你 | `⚡/f0_a.png` | `s4` | `f0` |
| `r_f0_b` | 323 | image | 你 | `⚡/f0_b.png` | `s4` | `f0` |
| `r_f0_c` | 324 | image | 你 | `⚡/f0_c.png` | `s4` | `f0` |
| `s4` | 325 | video | 沈婉儿（温柔） | `⚡/S4.hd.mp4` | `f_saoshi` | `r_f0_a`<br/>`r_f0_b`<br/>`r_f0_c` |
| `f_saoshi` | 326 | choice | — | `images/lastframes/S4.hd.jpg` | `r_f_saoshi_a`<br/>`r_f_saoshi_b`<br/>`f_saoshi_dance`<br/>`BE_SLAP` | `s4` |
| `r_f_saoshi_a` | 327 | image | 你（内心） | `⚡/f_saoshi_a.png` | `s5` | `f_saoshi` |
| `r_f_saoshi_b` | 328 | image | 你（内心） | `⚡/f_saoshi_b.png` | `s5` | `f_saoshi` |
| `f_saoshi_dance` | 329 | video | 沈婉儿（旋身） | `⚡/side04_kongque.hd.mp4` | `f_dance_react` | `f_saoshi` |
| `f_dance_react` | 330 | choice | — | — | `r_f_dance_react_a`<br/>`r_dance_encore_ep01`<br/>`BE_KICKED` | `f_saoshi_dance` |
| `r_f_dance_react_a` | 331 | image | 你 | `⚡/r_f_dance_react_a.v2.c.jpg` | `s5` | `f_dance_react` |
| `r_f_dance_react_b` | 332 | image | 你 | `⚡/r_f_dance_react_b.v2.c.jpg` | `s5` | — |
| `BE_KICKED` | 333 | video | — | `⚡/be5_kicked_out.hd.mp4` | `BE_KICKED_END` | `f_dance_react` |
| `BE_KICKED_END` | 334 | image | 你（内心） | `images/lastframes/be5_kicked_out.hd.jpg` | — | `BE_KICKED` |
| `s5` | 335 | video | 沈婉儿（心里） | `⚡/S5.hd.mp4` | `s5b` | `r_f_saoshi_a`<br/>`r_f_saoshi_b`<br/>`r_f_dance_react_a`<br/>`r_f_dance_react_b`<br/>`r_dance_encore_ep01` |
| `s5b` | 336 | text | 沈婉儿（压声哽） | — | `s5c` | `s5` |
| `s5c` | 337 | text | 沈婉儿 | — | `f_s5` | `s5b` |
| `f_s5` | 338 | choice | — | `images/lastframes/S5.hd.jpg` | `r_f_s5_a`<br/>`r_f_s5_b`<br/>`r_f_s5_c`<br/>`BE_LOSE_HER` | `s5c` |
| `r_f_s5_a` | 339 | image | 你 | `⚡/f_s5_a.png` | `s6` | `f_s5` |
| `r_f_s5_b` | 340 | image | 你（内心） | `⚡/f_s5_b.png` | `s6` | `f_s5` |
| `r_f_s5_c` | 341 | image | 你（内心） | `⚡/f_s5_c.png` | `s6` | `f_s5` |
| `s6` | 342 | video | 你（低吼） | `⚡/S6.hd.mp4` | `s6b` | `r_f_s5_a`<br/>`r_f_s5_b`<br/>`r_f_s5_c` |
| `s6b` | 343 | text | 系统 | — | `f_s6` | `s6` |
| `r_dance_encore_ep01` | 344 | video | 沈婉儿（含笑） | `⚡/side07_cailian.hd.mp4` | `s5` | `f_dance_react` |

## EP02

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `f_s6` | 345 | choice | — | `images/lastframes/S6.hd.jpg` | `r_f_s6_a`<br/>`r_f_s6_b`<br/>`r_f_s6_c`<br/>`BE_GOD` | `s6b` |
| `r_f_s6_a` | 346 | image | 你（内心） | `⚡/f_s6_a.png` | `s8` | `f_s6` |
| `r_f_s6_b` | 347 | image | 你 | `⚡/f_s6_b.png` | `s8` | `f_s6` |
| `r_f_s6_c` | 348 | image | 你 | `⚡/f_s6_c.png` | `s8` | `f_s6` |
| `s8` | 349 | video | 你（震撼低语） | `⚡/S8.hd.mp4` | `s8b` | `r_f_s6_a`<br/>`r_f_s6_b`<br/>`r_f_s6_c` |
| `s8b` | 350 | text | 你（攥拳） | — | `f_s8` | `s8` |
| `f_s8` | 351 | choice | — | `images/lastframes/S8.hd.jpg` | `r_f_s8_a`<br/>`r_f_s8_b`<br/>`r_f_s8_c` | `s8b` |
| `r_f_s8_a` | 352 | image | 你 | `⚡/f_s8_a.png` | `s9` | `f_s8` |
| `r_f_s8_b` | 353 | image | 你（嚼） | `⚡/f_s8_b.png` | `s9` | `f_s8` |
| `r_f_s8_c` | 354 | image | 你（内心） | `⚡/f_s8_c.png` | `s9` | `f_s8` |
| `s9` | 355 | video | 沈婉儿（掩嘴颤） | `⚡/S9.hd.mp4` | `s9b` | `r_f_s8_a`<br/>`r_f_s8_b`<br/>`r_f_s8_c` |
| `s9b` | 356 | text | 沈婉儿（跪下泪） | — | `f_s9` | `s9` |
| `f_s9` | 357 | choice | — | `images/lastframes/S9.hd.jpg` | `r_f_s9_a`<br/>`r_f_s9_b`<br/>`r_f_s9_c` | `s9b` |
| `r_f_s9_a` | 358 | image | 你 | `⚡/f_s9_a.png` | `s10` | `f_s9` |
| `r_f_s9_b` | 359 | image | 你 | `⚡/f_s9_b.png` | `s10` | `f_s9` |
| `r_f_s9_c` | 360 | image | 你（内心） | `⚡/f_s9_c.png` | `s10` | `f_s9` |
| `s10` | 361 | video | 你（沉声） | `⚡/S10.hd.mp4` | `s10b` | `r_f_s9_a`<br/>`r_f_s9_b`<br/>`r_f_s9_c` |
| `s10b` | 362 | text | 你（温柔） | — | `f_s10` | `s10` |
| `f_s10` | 363 | choice | — | `images/lastframes/S10.hd.jpg` | `r_s10_a`<br/>`r_s10_b`<br/>`r_s10_c` | `s10b` |
| `r_s10_a` | 364 | text | 你（心里） | — | `s10c` | `f_s10` |
| `r_s10_b` | 365 | text | 你（心里） | — | `s10c` | `f_s10` |
| `r_s10_c` | 366 | text | 你（心里） | — | `s10c` | `f_s10` |
| `s10c` | 367 | image | 旁白 | `⚡/frames/k0_a.jpg` | `k_bridge1` | `r_s10_a`<br/>`r_s10_b`<br/>`r_s10_c` |
| `k_bridge1` | 368 | video | 沈婉儿（搓衣角） | `⚡/k_bridge.hd.mp4` | `k_side_gate_bridge` | `s10c` |
| `k_side_gate_bridge` | 369 | text | 旁白 | — | `k_side_gate` | `k_bridge1` |
| `k_side_gate` | 370 | choice | — | — | `r_side07`<br/>`r_side01`<br/>`BE_SLAP`<br/>`k_side_after` | `k_side_gate_bridge` |
| `r_side07` | 371 | video | 沈婉儿（含笑） | `⚡/side07_cailian.hd.mp4` | `f_side_dance_react` | `k_side_gate` |
| `k_side_dress` | 372 | choice | — | — | `r_side01`<br/>`r_side02`<br/>`r_side03`<br/>`BE_SLAP`<br/>`k_side_after` | — |
| `r_side01` | 373 | video | 沈婉儿（气声） | `⚡/side01_hongdudou.hd.mp4` | `f_side_dress_react` | `k_side_gate`<br/>`k_side_dress` |
| `r_side02` | 374 | video | 沈婉儿（气声） | `⚡/side02_qipao.hd.mp4` | `f_side_dress_react` | `k_side_dress` |
| `r_side03` | 375 | video | 沈婉儿（气声） | `⚡/side03_shishen.hd.mp4` | `f_side_dress_react` | `k_side_dress` |
| `f_side_dress_react` | 376 | choice | — | — | `f_dress_a`<br/>`f_dress_b`<br/>`f_dress_c`<br/>`f_dress_d` | `r_side01`<br/>`r_side02`<br/>`r_side03` |
| `f_dress_a` | 377 | image·stay | 你（凝望） | `⚡/frames/f_dress_a.jpg` | `k_side_after` | `f_side_dress_react` |
| `f_dress_b` | 378 | image·stay | 你（憨笑） | `⚡/frames/f_dress_b.jpg` | `k_side_after` | `f_side_dress_react` |
| `f_dress_c` | 379 | image·stay | 你（招手） | `⚡/frames/f_dress_c.jpg` | `k_side_after` | `f_side_dress_react` |
| `f_dress_d` | 380 | image·stay | 你（打哈欠） | `⚡/frames/f_dress_d.jpg` | `k_side_after` | `f_side_dress_react` |
| `k_side_dance` | 381 | text | 沈婉儿（拿下发簪） | — | `r_side04` | — |
| `r_side04` | 382 | video | 沈婉儿（撒娇） | `⚡/side04_kongque.hd.mp4` | `f_side_dance_react` | `k_side_dance` |
| `r_side05` | 383 | video | 沈婉儿（撒娇） | `⚡/side05_jazz.hd.mp4` | `f_side_dance_react` | — |
| `r_side06` | 384 | video | 沈婉儿（撒娇） | `⚡/side06_dunhuang.hd.mp4` | `f_side_dance_react` | — |
| `f_side_dance_react` | 385 | choice | — | — | `f_dance_a`<br/>`r_dance_encore_home_ep02`<br/>`f_dance_c` | `r_side07`<br/>`r_side04`<br/>`r_side05`<br/>`r_side06` |
| `f_dance_a` | 386 | image·stay | 你（着迷） | `⚡/frames/f_dance_a.jpg` | `k_side_after` | `f_side_dance_react` |
| `f_dance_b` | 387 | image·stay | 你（起哄） | `⚡/frames/f_dance_b.jpg` | `k_side_after` | — |
| `f_dance_c` | 388 | image·stay | 你（撇嘴） | `⚡/frames/f_dance_c.jpg` | `k_side_after` | `f_side_dance_react` |
| `k_side_after` | 389 | image·stay | 沈婉儿（依偎） | `⚡/frames/k_side_after.jpg` | `k_side_after2` | `k_side_gate`<br/>`k_side_dress`<br/>`f_dress_a`<br/>`f_dress_b`<br/>`f_dress_c` +5 |
| `k_side_after2` | 390 | image·stay | 你（内心） | `⚡/frames/k_side_after2.jpg` | `k0` | `k_side_after` |
| `k_side_after_gentle` | 391 | image | 你（轻声） | `⚡/frames/k_side_after_gentle.jpg` | `k0` | — |
| `k0` | 392 | choice | 旁白 | `⚡/frames/k_side_after.jpg` | `k0_a`<br/>`k0_b`<br/>`k0_c`<br/>`BE_DRUNK` | `k_side_after2`<br/>`k_side_after_gentle` |
| `k0_a` | 393 | image·stay | 你（拍板） | `⚡/frames/k0_a.jpg` | `e2s1` | `k0` |
| `k0_b` | 394 | image·stay | 你（内心） | `⚡/frames/k0_b.jpg` | `k0_b_bridge` | `k0` |
| `k0_b_bridge` | 395 | image·stay | 旁白 | `⚡/frames/k0_b_bridge.jpg` | `e2s1` | `k0_b` |
| `k0_c` | 396 | image·stay | 你（笑） | `⚡/frames/k0_c.jpg` | `k0_c_bridge` | `k0` |
| `k0_c_bridge` | 397 | image·stay | 旁白 | `⚡/frames/k0_c_bridge.jpg` | `e2s1` | `k0_c` |
| `e2s1` | 398 | video·fc | 旁白 | `⚡/e2s1.hd.mp4` | `e2s2` | `k0_a`<br/>`k0_b_bridge`<br/>`k0_c_bridge` |
| `e2s2` | 399 | video·fc | 旁白 | `⚡/e2s2.hd.mp4` | `f_e2s2` | `e2s1` |
| `f_e2s2` | 400 | choice | — | `⚡/frames/e2s2.jpg` | `r_e2s2_a`<br/>`r_e2s2_b`<br/>`r_e2s2_c` | `e2s2` |
| `r_e2s2_a` | 401 | image | 你（心里） | `⚡/r_e2s2_a.c.jpg` | `e2s3` | `f_e2s2` |
| `r_e2s2_b` | 402 | image | 你（心里） | `⚡/r_e2s2_b.c.jpg` | `e2s3` | `f_e2s2` |
| `r_e2s2_c` | 403 | image | 你（心里） | `⚡/r_e2s2_c.c.jpg` | `e2s3` | `f_e2s2` |
| `e2s3` | 404 | video | 粮贩子（叼烟·脚踩秤） | `⚡/e2s3.hd.mp4` | `e2s3b` | `r_e2s2_a`<br/>`r_e2s2_b`<br/>`r_e2s2_c` |
| `e2s3b` | 405 | text | 你（心里） | — | `f_e2_haggle` | `e2s3` |
| `f_e2_haggle` | 406 | choice | — | `⚡/frames/e2s3.jpg` | `r_haggle_a`<br/>`r_haggle_b`<br/>`r_haggle_c`<br/>`BE_STARVE`<br/>`r_haggle_d` | `e2s3b` |
| `r_haggle_a` | 407 | image | 你 | `⚡/frames/r_haggle_a.jpg` | `r_haggle_a2` | `f_e2_haggle` |
| `r_haggle_a2` | 408 | text | 粮贩子（脸抽了抽） | — | `e2s4` | `r_haggle_a` |
| `r_haggle_b` | 409 | image | 你（哑声） | `⚡/frames/r_haggle_b.jpg` | `r_haggle_b2` | `f_e2_haggle` |
| `r_haggle_b2` | 410 | text | 粮贩子（叹口气） | — | `e2s4` | `r_haggle_b` |
| `r_haggle_c` | 411 | image | 你（冷） | `⚡/r_haggle_c.v2.c.jpg` | `r_haggle_c2` | `f_e2_haggle` |
| `r_haggle_c2` | 412 | text | 粮贩子（追出来·陪笑） | — | `e2s4` | `r_haggle_c` |
| `r_haggle_d` | 413 | image | 你（一把踢开秤盘） | `⚡/frames/r_haggle_d.jpg` | `r_haggle_d2` | `f_e2_haggle` |
| `r_haggle_d2` | 414 | text | 旁白 | — | `r_haggle_d3` | `r_haggle_d` |
| `r_haggle_d3` | 415 | image | 粮贩子（哆嗦跪地） | `⚡/frames/r_haggle_d.jpg` | `s_stone_video` | `r_haggle_d2` |
| `s_stone_video` | 416 | video | 旁白 | `⚡/skill_stone_activate.c.mp4` | `s_stone` | `r_haggle_d3` |
| `s_stone` | 417 | text | 系统 | — | `e2s4` | `s_stone_video` |
| `e2s4` | 418 | image | 旁白 | `⚡/e2s4.c.jpg` | `k_side_gate_e2` | `r_haggle_a2`<br/>`r_haggle_b2`<br/>`r_haggle_c2`<br/>`s_stone` |
| `k_side_gate_e2` | 419 | choice | — | `⚡/e2s4_market_rest.v2.c.jpg` | `r_side05_e2`<br/>`r_side06_e2`<br/>`e2_cloth_enter` | `e2s4` |
| `r_side05_e2` | 420 | video | 你（内心） | `⚡/side05_jazz.hd.mp4` | `f_side_dance_e2_react` | `k_side_gate_e2` |
| `r_side06_e2` | 421 | video | 你（内心） | `⚡/side06_dunhuang.hd.mp4` | `f_side_dance_e2_react` | `k_side_gate_e2` |
| `f_side_dance_e2_react` | 422 | choice | — | `⚡/e2s4_market_rest.v2.c.jpg` | `r_side_dance_e2_a`<br/>`r_dance_encore_market_ep02`<br/>`r_side_dance_e2_c` | `r_side05_e2`<br/>`r_side06_e2` |
| `r_side_dance_e2_a` | 423 | text·stay | 你（心里） | — | `e2_cloth_enter` | `f_side_dance_e2_react` |
| `r_side_dance_e2_b` | 424 | text·stay | 你（心里） | — | `e2_cloth_enter` | — |
| `r_side_dance_e2_c` | 425 | text·stay | 你（心里） | — | `e2_cloth_enter` | `f_side_dance_e2_react` |
| `e2_cloth_enter` | 426 | image·stay | 旁白 | `⚡/frames/e2s5.jpg` | `f_e2_cloth` | `k_side_gate_e2`<br/>`r_side_dance_e2_a`<br/>`r_side_dance_e2_b`<br/>`r_side_dance_e2_c`<br/>`r_dance_encore_market_ep02` |
| `f_e2_cloth` | 427 | choice | — | `⚡/f_e2_cloth_counter.v2.c.jpg` | `e2s5`<br/>`r_e2_cloth_indigo`<br/>`r_e2_cloth_red`<br/>`r_e2_cloth_qipao` | `e2_cloth_enter` |
| `r_e2_cloth_indigo` | 428 | text | 你（心里） | — | `e2s5` | `f_e2_cloth` |
| `r_e2_cloth_red` | 429 | image | 你（内心） | `⚡/e2_cloth_red.v2.c.jpg` | `e2s5` | `f_e2_cloth` |
| `r_e2_cloth_qipao` | 430 | image | 你（内心） | `⚡/e2_cloth_qipao.v2.c.jpg` | `e2s5` | `f_e2_cloth` |
| `e2s5` | 431 | video·fc | 你 | `⚡/e2s5.hd.mp4` | `e2s5b_shop` | `f_e2_cloth`<br/>`r_e2_cloth_indigo`<br/>`r_e2_cloth_red`<br/>`r_e2_cloth_qipao` |
| `e2s5b_shop` | 432 | image | 布铺老板娘（笑眯眯） | `⚡/e2s5_boss.v2.c.jpg` | `e2s5b` | `e2s5` |
| `e2s5b` | 433 | text | 你（心里） | — | `e2s5_bridge` | `e2s5b_shop` |
| `e2s5_bridge` | 434 | image | 旁白 | `⚡/e2s5_road.v2.c.jpg` | `e2s6` | `e2s5b` |
| `e2s6` | 435 | video·fc | 赵铁牛（拦路，痞笑） | `⚡/e2s6.hd.mp4` | `f_e2s6` | `e2s5_bridge` |
| `f_e2s6` | 436 | choice | — | `⚡/e2s6.v2.c.jpg` | `e2s6b`<br/>`r_e2s6_pay`<br/>`r_e2s6_hide` | `e2s6` |
| `r_e2s6_pay` | 437 | text | 你（心里） | — | `k1` | `f_e2s6` |
| `r_e2s6_hide` | 438 | text | 你（心里） | — | `k1` | `f_e2s6` |
| `e2s6b` | 439 | text | 你（冷） | — | `k1` | `f_e2s6` |
| `k1` | 440 | choice | — | `⚡/k1_zhao_encounter.c.mp4` | `r_k1_a`<br/>`r_k1_b`<br/>`r_k1_c`<br/>`BE_PARTNER` | `r_e2s6_pay`<br/>`r_e2s6_hide`<br/>`e2s6b` |
| `r_k1_a` | 441 | image | 你（心里） | `⚡/r_k1_a.v2.c.jpg` | `k1_bridge_a` | `k1` |
| `r_k1_b` | 442 | image | 你 | `⚡/frames/r_k1_b.jpg` | `k1_bridge_b` | `k1` |
| `r_k1_c` | 443 | image | 你（心里） | `⚡/r_k1_c.v2.c.jpg` | `k1_bridge_c` | `k1` |
| `k1_bridge_a` | 444 | image·stay | 旁白 | `⚡/r_k1_a.v2.c.jpg` | `e3s1` | `r_k1_a` |
| `k1_bridge_b` | 445 | image·stay | 旁白 | `⚡/frames/r_k1_b.jpg` | `e3s1` | `r_k1_b` |
| `k1_bridge_c` | 446 | image·stay | 旁白 | `⚡/r_k1_c.v2.c.jpg` | `e3s1` | `r_k1_c` |
| `r_dance_encore_home_ep02` | 447 | video | 沈婉儿（撒娇） | `⚡/side04_kongque.hd.mp4` | `k_side_after` | `f_side_dance_react` |
| `r_dance_encore_market_ep02` | 448 | video | 沈婉儿（含笑） | `⚡/side07_cailian.hd.mp4` | `e2_cloth_enter` | `f_side_dance_e2_react` |

## EP03

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `k_side_gate2` | 449 | choice | — | — | `r_side08`<br/>`k_side_dress_e3`<br/>`e3_trans1`<br/>`BE_SLAP` | `k2` |
| `e3s1` | 450 | video·fc | 旁白 | `⚡/e3s1.hd.mp4` | `e3s1b` | `k1_bridge_a`<br/>`k1_bridge_b`<br/>`k1_bridge_c` |
| `e3s1b` | 451 | text | 沈婉儿（心里） | — | `f_e3s1` | `e3s1` |
| `f_e3s1` | 452 | choice | — | `⚡/frames/e3s1.jpg` | `e3s2` | `e3s1b` |
| `e3s2` | 453 | video·fc | 沈婉儿 | `⚡/e3s2.hd.mp4` | `e3s2b` | `f_e3s1` |
| `e3s2b` | 454 | text | 你 | — | `f2` | `e3s2` |
| `f2` | 455 | choice | — | `⚡/frames/e3s2.jpg` | `r_f2_a`<br/>`r_f2_b`<br/>`r_f2_c`<br/>`r_f2_d`<br/>`BE_DRUNK` | `e3s2b` |
| `r_f2_a` | 456 | image | 你 | `⚡/r_f2_a.c.jpg` | `e3s3` | `f2` |
| `r_f2_b` | 457 | image | 旁白 | `⚡/r_f2_b.c.jpg` | `e3s3` | `f2` |
| `r_f2_c` | 458 | image | 你 | `⚡/r_f2_c.jpg` | `e3s3` | `f2` |
| `r_f2_d` | 459 | video | 你 | `⚡/r_f2_d.hd.mp4` | `e3s3` | `f2` |
| `e3s3` | 460 | video·fc | 旁白 | `⚡/e3s3_v2.hd.mp4` | `e3s3b` | `r_f2_a`<br/>`r_f2_b`<br/>`r_f2_c`<br/>`r_f2_d` |
| `e3s3b` | 461 | text | 你（心里） | — | `f_e3s3` | `e3s3` |
| `f_e3s3` | 462 | choice | — | — | `r_f_e3s3_a`<br/>`r_f_e3s3_c` | `e3s3b` |
| `r_f_e3s3_a` | 463 | image | 你（心里） | `⚡/r_f_e3s3_a.v2.c.jpg` | `e3s4` | `f_e3s3` |
| `r_f_e3s3_c` | 464 | image | 你（心里） | `⚡/r_f_e3s3_c.v2.c.jpg` | `e3s4` | `f_e3s3` |
| `e3s4` | 465 | video·fc | 沈婉儿 | `⚡/e3s4.hd.mp4` | `e3s4b` | `r_f_e3s3_a`<br/>`r_f_e3s3_c` |
| `e3s4b` | 466 | text | 沈婉儿（脸红） | — | `f_e3_look` | `e3s4` |
| `f_e3_look` | 467 | choice | — | — | `e3s5`<br/>`r_e3_eyes`<br/>`r_e3_pull` | `e3s4b` |
| `r_e3_eyes` | 468 | video | 你 | `⚡/r_e3_eyes.hd.mp4` | `e3s5` | `f_e3_look` |
| `r_e3_pull` | 469 | video | 你 | `⚡/r_e3_pull.hd.mp4` | `e3s5` | `f_e3_look` |
| `e3s5` | 470 | video·fc | 沈婉儿 | `⚡/e3s5.hd.mp4` | `e3s5b` | `f_e3_look`<br/>`r_e3_eyes`<br/>`r_e3_pull` |
| `e3s5b` | 471 | text | 你 | — | `f_e3s5` | `e3s5` |
| `f_e3s5` | 472 | choice | — | `⚡/frames/e3s5.jpg` | `e3s6`<br/>`r_f_e3s5_c`<br/>`r_f_e3s5_ad`<br/>`BE_LOSE_HER` | `e3s5b` |
| `r_f_e3s5_ad` | 473 | image·fc | 旁白 | `⚡/r_f_e3s5_ad.v2.c.jpg` | `e3s6` | `f_e3s5` |
| `r_f_e3s5_c` | 474 | image·fc | 旁白 | `⚡/r_f_e3s5_c.v2.c.jpg` | `e3s6` | `f_e3s5` |
| `e3s6` | 475 | video | 沈婉儿 | `⚡/e3s6.hd.mp4` | `e3s6b` | `f_e3s5`<br/>`r_f_e3s5_ad`<br/>`r_f_e3s5_c` |
| `e3s6b` | 476 | text | 你 | — | `f_e3s6` | `e3s6` |
| `f_e3s6` | 477 | choice | — | — | `e3s7`<br/>`r_f_e3s6_b`<br/>`r_f_e3s6_gold` | `e3s6b` |
| `r_f_e3s6_b` | 478 | image·fc | 旁白 | `⚡/r_f_e3s6_b.v2.c.jpg` | `e3s7` | `f_e3s6` |
| `r_f_e3s6_gold` | 479 | image | 沈婉儿 | `⚡/r_f_e3s6_b.v2.c.jpg` | `r_f_e3s6_gold_b` | `f_e3s6` |
| `r_f_e3s6_gold_b` | 480 | image | 你 | `⚡/r_f_e3s6_b.v2.c.jpg` | `e3s7` | `r_f_e3s6_gold` |
| `e3s7` | 481 | video | 旁白 | `⚡/e3s7.hd.mp4` | `k2` | `f_e3s6`<br/>`r_f_e3s6_b`<br/>`r_f_e3s6_gold_b` |
| `k2` | 482 | choice | — | — | `r_k2_1`<br/>`r_k2_2`<br/>`r_k2_3`<br/>`k_side_gate2`<br/>`BE_LOSE_HER` | `e3s7` |
| `r_k2_1` | 483 | text | 你（心里） | — | `e3_trans1` | `k2` |
| `r_k2_2` | 484 | text | 你（心里） | — | `e3_trans1` | `k2` |
| `r_k2_3` | 485 | text | 你（心里） | — | `e3_trans1` | `k2` |
| `r_side08` | 486 | video | — | `⚡/side08_shuixiu.c.mp4` | `e3_trans1` | `k_side_gate2` |
| `k_side_dress_e3` | 487 | choice | — | — | `r_side01_e3`<br/>`r_side02_e3`<br/>`r_side03_e3`<br/>`BE_SLAP`<br/>`e3_trans1` | `k_side_gate2` |
| `r_side01_e3` | 488 | video | 沈婉儿（气声） | `⚡/side01_hongdudou.hd.mp4` | `e3_trans1` | `k_side_dress_e3` |
| `r_side02_e3` | 489 | video | 沈婉儿（气声） | `⚡/side02_qipao.hd.mp4` | `e3_trans1` | `k_side_dress_e3` |
| `r_side03_e3` | 490 | video | 沈婉儿（气声） | `⚡/side03_shishen.hd.mp4` | `e3_trans1` | `k_side_dress_e3` |
| `e3_trans1` | 491 | image·fc | 旁白 | `⚡/frames/e3s7.jpg` | `e3_trans2` | `k_side_gate2`<br/>`r_k2_1`<br/>`r_k2_2`<br/>`r_k2_3`<br/>`r_side08` +4 |
| `e3_trans2` | 492 | image·fc | 你（心里） | `⚡/e2s6.v2.c.jpg` | `e4s1` | `e3_trans1` |

## EP04

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `e4s1` | 493 | video | 赵铁牛（嘶吼） | `⚡/e4s1.c.mp4` | `e4s3` | `e3_trans2` |
| `e4s3` | 494 | video | 你（低吼） | `⚡/e4s3.c.mp4` | `f3` | `e4s1` |
| `f3` | 495 | choice | — | — | `r_f3_1`<br/>`BE_BEATEN`<br/>`r_f3_3` | `e4s3` |
| `e4s4` | 496 | video·fc | 你 | `⚡/e4s4.c.mp4` | `f_e4s4` | `r_f3_1`<br/>`r_f3_3` |
| `e4s6` | 497 | video | 你（怒吼） | `⚡/e4s6.c.mp4` | `e4s7` | `s_muscle` |
| `e4s7` | 498 | video | 旁白 | `⚡/e4s7_v82.mp4` | `e4s8` | `e4s6` |
| `e4s8` | 499 | video·fc | 沈婉儿（哽） | `⚡/e4s8.c.mp4` | `f_e4s8` | `e4s7` |
| `r_f3_1` | 500 | text | 你（心里） | — | `e4s4` | `f3` |
| `r_f3_3` | 501 | text·stay | 你（心里） | — | `e4s4` | `f3` |
| `f_e4s4` | 502 | choice | — | — | `r_fe4s4_a`<br/>`r_fe4s4_b`<br/>`r_fe4s4_c` | `e4s4` |
| `r_fe4s4_a` | 503 | text·stay | 旁白 | — | `e4_muscle` | `f_e4s4` |
| `r_fe4s4_b` | 504 | text | 旁白 | — | `e4_muscle` | `f_e4s4` |
| `r_fe4s4_c` | 505 | text | 旁白 | — | `e4_muscle` | `f_e4s4` |
| `f_e4s8` | 506 | choice | — | — | `r_fe4s8_b`<br/>`r_fe4s8_c`<br/>`r_fe4s8_d` | `e4s8` |
| `r_fe4s8_b` | 507 | video | 旁白 | `⚡/e4_shangyao_v82.mp4` | `e4_to_e5` | `f_e4s8` |
| `r_fe4s8_c` | 508 | text | 旁白 | — | `e4_to_e5` | `f_e4s8` |
| `r_fe4s8_d` | 509 | text | 旁白 | — | `e4_to_e5` | `f_e4s8` |
| `e4_muscle` | 510 | image·fc | 旁白 | `⚡/skill_muscle_activate.c.jpg` | `s_muscle` | `r_fe4s4_a`<br/>`r_fe4s4_b`<br/>`r_fe4s4_c` |
| `s_muscle` | 511 | text | 系统 | — | `e4s6` | `e4_muscle` |
| `e4_to_e5` | 512 | image·fc | 旁白 | `images/lastframes/e4s7_v82.jpg` | `e5s0a` | `r_fe4s8_b`<br/>`r_fe4s8_c`<br/>`r_fe4s8_d` |

## EP05

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `e5s0a` | 513 | video | 你（冷眼） | `⚡/n5s0a.mp4` | `e5s0b` | `e4_to_e5` |
| `e5s0b` | 514 | video | 你（揣钱回家） | `⚡/n5s0b.mp4` | `e5s1` | `e5s0a` |
| `e5s1` | 515 | video | 你（推门） | `⚡/n5s1.mp4` | `e5s2` | `e5s0b` |
| `e5s2` | 516 | video | 沈婉儿（笑） | `⚡/n5s2.mp4` | `f5_drink` | `e5s1` |
| `f5_drink` | 517 | choice | — | — | `r_drink_a`<br/>`r_drink_b`<br/>`r_drink_c` | `e5s2` |
| `r_drink_a` | 518 | video | 沈婉儿（醉眼） | `⚡/n5_drink_a.mp4` | `e5s2c` | `f5_drink` |
| `r_drink_b` | 519 | video | 沈婉儿（凑近） | `⚡/n5_drink_b.mp4` | `e5s2c` | `f5_drink` |
| `r_drink_c` | 520 | video | 沈婉儿（仰头） | `⚡/n5_drink_c.mp4` | `e5s2c` | `f5_drink` |
| `e5s2c` | 521 | video | 你（回想） | `⚡/n5_drink_peak.mp4` | `e5s3` | `r_drink_a`<br/>`r_drink_b`<br/>`r_drink_c` |
| `e5s3` | 522 | video | 沈婉儿（惊） | `⚡/n5s3.mp4` | `f5_fix` | `e5s2c` |
| `f5_fix` | 523 | choice | — | — | `BE_ROOF`<br/>`r_fix_b`<br/>`r_fix_c` | `e5s3` |
| `r_fix_b` | 524 | video | 你（低声） | `⚡/n5_fix_b.mp4` | `r_fix_b_grand` | `f5_fix`<br/>`f5_fix2` |
| `r_fix_b_grand` | 525 | video | 沈婉儿（惊喜） | `⚡/n5_fix_b_grand.mp4` | `e5s4` | `r_fix_b` |
| `r_fix_c` | 526 | video | 沈婉儿（发抖） | `⚡/n5_fix_c.mp4` | `e5_bridge` | `f5_fix` |
| `e5_bridge` | 527 | video | 旁白 | `⚡/n5_bridge.mp4` | `f5_fix2` | `r_fix_c` |
| `f5_fix2` | 528 | choice | — | — | `BE_ROOF`<br/>`r_fix_b` | `e5_bridge` |
| `e5s4` | 529 | video | 沈婉儿（怔住） | `⚡/n5s4.mp4` | `e5s5` | `r_fix_b_grand` |
| `e5s5` | 530 | video | 沈婉儿（认真） | `⚡/n5s5.mp4` | `f5_biz` | `e5s4` |
| `f5_biz` | 531 | choice | — | — | `BE_DROUGHT`<br/>`r_biz_b`<br/>`BE_ALONE` | `e5s5` |
| `r_biz_b` | 532 | video | 沈婉儿（记账） | `⚡/n5_biz_b.mp4` | `e5s6` | `f5_biz` |
| `e5s6` | 533 | video | 旁白 | `⚡/n5s6.mp4` | `e5s7` | `r_biz_b` |
| `e5s7` | 534 | video | 沈婉儿（趴在栏上） | `⚡/n5s7.mp4` | `f5_rub` | `e5s6` |
| `f5_rub` | 535 | choice | — | — | `r_rub_a`<br/>`r_rub_b`<br/>`r_rub_c` | `e5s7` |
| `r_rub_a` | 536 | video | 沈婉儿（长出一口气） | `⚡/n5_rub_a.mp4` | `r_rub_a2` | `f5_rub` |
| `r_rub_a2` | 537 | video | 沈婉儿（很轻） | `⚡/n5_rub_a2.mp4` | `e5s8` | `r_rub_a` |
| `r_rub_b` | 538 | video | 沈婉儿（怔） | `⚡/n5_rub_b.mp4` | `r_rub_b2` | `f5_rub` |
| `r_rub_b2` | 539 | video | 你（低） | `⚡/n5_rub_b2.mp4` | `e5s8` | `r_rub_b` |
| `r_rub_c` | 540 | video | 沈婉儿（平淡） | `⚡/n5_rub_c.mp4` | `BE_RUB_ALONE` | `f5_rub` |
| `e5s8` | 541 | video | 你（心里） | `⚡/n5s8.mp4` | `e5_end` | `r_rub_a2`<br/>`r_rub_b2` |
| `e5_end` | 542 | text | — | — | — | `e5s8` |

## EP99

| ID | 行号 | 类型 | speaker | media | → next | ← from |
|---|---:|---|---|---|---|---|
| `BE_SLAP` | 543 | video | 沈婉儿（怒吐） | `⚡/be5_kicked_out.hd.mp4` | — | `f_saoshi`<br/>`k_side_gate`<br/>`k_side_dress`<br/>`k_side_gate2`<br/>`k_side_dress_e3` |
| `BE_GOD` | 544 | video·fc | 村民（举火把嘶吼） | `⚡/be4_witch_hunt.c.mp4` | — | `f_s6` |
| `BE_MONSTER` | 545 | video·fc | 村民（举火把嘶吼） | `⚡/be4_witch_hunt.c.mp4` | — | — |
| `BE_LOSE_HER` | 546 | video | 你（内心） | `⚡/be1_she_left.c.mp4` | — | `f_s5`<br/>`f_e3s5`<br/>`k2` |
| `BE_RUNAWAY` | 547 | video | 你（内心） | `⚡/be3_nowhere.c.mp4` | — | — |
| `BE_RUNAWAY_BRIDE` | 548 | image | 沈婉儿（心碎） | `images/lastframes/be1_she_left.c.jpg` | — | — |
| `BE_DRUNK` | 549 | video | 你（酒话） | `⚡/be6_lost_power_v2.c.mp4` | — | `k0`<br/>`f2` |
| `BE_PARTNER` | 550 | video·fc | 你（内心） | `⚡/be_partner_drunk.c.mp4` | — | `k1` |
| `BE_STARVE` | 551 | video·fc | 沈婉儿 | `⚡/be2_starve_death_v2.c.mp4` | — | `f0`<br/>`f_e2_haggle` |
| `BE_ALLIANCE_KILLED` | 552 | image·fc | 旁白 | `⚡/BE_ALLIANCE_KILLED_frame.v2.c.jpg` | — | — |
| `BE_ROOF` | 553 | video | 沈婉儿（雨里） | `⚡/n5_fix_a.mp4` | — | `f5_fix`<br/>`f5_fix2` |
| `BE_DROUGHT` | 554 | video | 你（跪在地头） | `⚡/n5_biz_a.mp4` | — | `f5_biz` |
| `BE_ALONE` | 555 | video | 旁白 | `⚡/n5_biz_c.mp4` | — | `f5_biz` |
| `BE_RUB_ALONE` | 556 | video | 你（一个人） | `⚡/n5_guanggun.mp4` | — | `r_rub_c` |
| `BE_BEATEN` | 557 | image·fc | 旁白 | `⚡/BE_BEATEN_frame.c.jpg` | — | `f3` |


## 🧭 图健康度

- 从 `op1` 可达：**237 / 252**
- 孤儿节点：**15**
<details><summary>展开</summary>

- `r_f_dance_react_b` (line 332, EP01)
- `k_side_dress` (line 372, EP02)
- `r_side02` (line 374, EP02)
- `r_side03` (line 375, EP02)
- `k_side_dance` (line 381, EP02)
- `r_side04` (line 382, EP02)
- `r_side05` (line 383, EP02)
- `r_side06` (line 384, EP02)
- `f_dance_b` (line 387, EP02)
- `k_side_after_gentle` (line 391, EP02)
- `r_side_dance_e2_b` (line 424, EP02)
- `BE_MONSTER` (line 545, EP99)
- `BE_RUNAWAY` (line 547, EP99)
- `BE_RUNAWAY_BRIDE` (line 548, EP99)
- `BE_ALLIANCE_KILLED` (line 552, EP99)

</details>
