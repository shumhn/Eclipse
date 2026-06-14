/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/prediction_market.json`.
 */
export type PredictionMarket = {
  "address": "79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t",
  "metadata": {
    "name": "predictionMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Permissionless private prediction markets on Solana using MagicBlock / PER"
  },
  "instructions": [
    {
      "name": "claimSettledPrivatePosition",
      "docs": [
        "Claim final settled payout from the Solana L1 vault.",
        "",
        "This happens after ER/PER settlement writes claimable_amount into",
        "the public TraderPosition shell."
      ],
      "discriminator": [
        17,
        94,
        151,
        20,
        20,
        58,
        163,
        42
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader claiming settled payout."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ],
          "writable": true
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Protocol collateral mint."
          ]
        },
        {
          "name": "traderCollateral",
          "docs": [
            "Trader collateral token account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "docs": [
            "Market vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program."
          ]
        },
        {
          "name": "associatedTokenProgram",
          "docs": [
            "Associated token program."
          ],
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [],
      "returns": "u64"
    },
    {
      "name": "commitAndUndelegate",
      "docs": [
        "Commit and undelegate market shell back to Solana L1.",
        "",
        "Usually called after market resolution / settlement."
      ],
      "discriminator": [
        9,
        108,
        132,
        87,
        184,
        76,
        98,
        84
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Creator/admin/oracle committing the market back."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitMarket",
      "docs": [
        "Commit and undelegate market shell back to Solana L1.",
        "",
        "Usually called after market resolution / settlement."
      ],
      "discriminator": [
        155,
        54,
        116,
        248,
        97,
        212,
        7,
        212
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Creator/admin/oracle committing the market back."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitPosition",
      "docs": [
        "Commit and undelegate trader position shell back to Solana L1.",
        "",
        "Usually called after settle_private_position_er has written final",
        "claimable_amount into the public position shell."
      ],
      "discriminator": [
        81,
        180,
        68,
        206,
        28,
        149,
        221,
        22
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Trader/admin committing the position back."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.market",
                "account": "traderPosition"
              },
              {
                "kind": "account",
                "path": "position.trader",
                "account": "traderPosition"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitPositionAndUndelegate",
      "docs": [
        "Commit and undelegate trader position shell back to Solana L1.",
        "",
        "Usually called after settle_private_position_er has written final",
        "claimable_amount into the public position shell."
      ],
      "discriminator": [
        112,
        52,
        144,
        249,
        215,
        81,
        203,
        29
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Trader/admin committing the position back."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.market",
                "account": "traderPosition"
              },
              {
                "kind": "account",
                "path": "position.trader",
                "account": "traderPosition"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createMarketPermission",
      "docs": [
        "Delegate market shell into MagicBlock / PER.",
        "",
        "Permission:",
        "- market creator",
        "- protocol admin"
      ],
      "discriminator": [
        25,
        227,
        253,
        47,
        62,
        57,
        222,
        195
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permissionProgram",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createPositionPermission",
      "docs": [
        "Create a MagicBlock permission PDA for a trader position shell.",
        "",
        "This mirrors the working payroll flow, where the delegated public PDA",
        "first gets a permission account before the permission itself is delegated."
      ],
      "discriminator": [
        63,
        240,
        0,
        131,
        105,
        193,
        0,
        50
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.market",
                "account": "traderPosition"
              },
              {
                "kind": "account",
                "path": "position.trader",
                "account": "traderPosition"
              }
            ]
          }
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permissionProgram",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createPrivateMarket",
      "docs": [
        "Create a permissionless private prediction market.",
        "",
        "This creates:",
        "- Market shell PDA",
        "- creator TraderPosition shell PDA",
        "- collateral vault ATA",
        "",
        "It does NOT mint public YES/NO SPL tokens."
      ],
      "discriminator": [
        17,
        218,
        47,
        31,
        130,
        58,
        12,
        35
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "Permissionless market creator."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global protocol config."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Public market shell.",
            "",
            "PDA:",
            "seeds = [\"market\", config.market_count.to_le_bytes()]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.market_count",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "creatorPosition",
          "docs": [
            "Creator's public position shell.",
            "",
            "PDA:",
            "seeds = [\"position\", market.key(), creator.key()]"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Protocol collateral mint."
          ]
        },
        {
          "name": "creatorCollateral",
          "docs": [
            "Creator's collateral token account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "docs": [
            "Market vault.",
            "",
            "ATA:",
            "mint = collateral_mint",
            "authority = market PDA",
            "",
            "This vault holds real collateral on Solana L1."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program."
          ]
        },
        {
          "name": "associatedTokenProgram",
          "docs": [
            "Associated token program."
          ],
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "question",
          "type": "string"
        },
        {
          "name": "endTime",
          "type": "u64"
        },
        {
          "name": "initialLiquidity",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateMarketIntoTee",
      "docs": [
        "Delegate market shell into MagicBlock / PER.",
        "",
        "Permission:",
        "- market creator",
        "- protocol admin"
      ],
      "discriminator": [
        27,
        207,
        30,
        103,
        182,
        93,
        125,
        204
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Creator/admin delegating the market."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                91,
                78,
                92,
                116,
                122,
                200,
                255,
                148,
                184,
                56,
                0,
                182,
                188,
                113,
                85,
                98,
                165,
                251,
                167,
                30,
                59,
                249,
                151,
                85,
                192,
                227,
                101,
                25,
                4,
                144,
                255,
                123
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell to delegate.",
            "",
            "We deserialize and validate this manually because MagicBlock's",
            "`#[account(mut, del)]` delegation marker works on AccountInfo."
          ],
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePositionIntoTee",
      "docs": [
        "Delegate trader position shell into MagicBlock / PER.",
        "",
        "Permission:",
        "- trader",
        "- protocol admin"
      ],
      "discriminator": [
        19,
        2,
        231,
        98,
        41,
        149,
        43,
        28
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Trader/admin delegating the position."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                91,
                78,
                92,
                116,
                122,
                200,
                255,
                148,
                184,
                56,
                0,
                182,
                188,
                113,
                85,
                98,
                165,
                251,
                167,
                30,
                59,
                249,
                151,
                85,
                192,
                227,
                101,
                25,
                4,
                144,
                255,
                123
              ]
            }
          }
        },
        {
          "name": "delegationRecordPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell to delegate.",
            "",
            "We deserialize and validate this manually because MagicBlock's",
            "`#[account(mut, del)]` marker works on AccountInfo."
          ],
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "79RQQN3A4HHrogrBTwUw5py8UMhhyKFFb1CmVGagZ55t"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "market",
          "type": "pubkey"
        },
        {
          "name": "trader",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "depositCollateral",
      "docs": [
        "Deposit collateral into the market L1 vault.",
        "",
        "This does not reveal YES/NO direction because no trade happens here."
      ],
      "discriminator": [
        156,
        131,
        142,
        116,
        146,
        247,
        162,
        120
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader depositing collateral."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ],
          "writable": true
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Protocol collateral mint."
          ]
        },
        {
          "name": "traderCollateral",
          "docs": [
            "Trader's collateral token account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "docs": [
            "Market vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program."
          ]
        },
        {
          "name": "associatedTokenProgram",
          "docs": [
            "Associated token program."
          ],
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize global protocol configuration.",
        "",
        "Called once during deployment."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Protocol admin.",
            "",
            "This signer pays for the config account and becomes protocol admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global protocol configuration account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral mint used by the protocol.",
            "",
            "Example:",
            "- USDC",
            "- test USDC",
            "- Token-2022 compatible collateral mint"
          ]
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "protocolFeeBps",
          "type": "u16"
        },
        {
          "name": "oracle",
          "type": "pubkey"
        },
        {
          "name": "teeValidator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializePrivateMarketState",
      "docs": [
        "Initialize ER/PER-only private market state and creator private position.",
        "",
        "This converts creator's initial L1 liquidity into balanced virtual",
        "YES/NO exposure inside PER."
      ],
      "discriminator": [
        30,
        189,
        17,
        184,
        165,
        208,
        98,
        99
      ],
      "accounts": [
        {
          "name": "creator",
          "docs": [
            "Market creator."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Public market shell.",
            "",
            "This sponsors/anchors the ER private market state."
          ]
        },
        {
          "name": "creatorPosition",
          "docs": [
            "Creator public position shell.",
            "",
            "This delegated PDA is the single sponsor for both ER-only accounts",
            "created during private market initialization.",
            "",
            "This is a delegated sponsor shell. We deserialize and validate it",
            "manually to avoid Anchor write-back on exit."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "marketState",
          "docs": [
            "ER/PER-only live market state.",
            "",
            "Created and serialized manually inside MagicBlock / PER."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "privatePosition",
          "docs": [
            "ER/PER-only creator live position state.",
            "",
            "Created and serialized manually inside MagicBlock / PER."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializePrivatePositionState",
      "docs": [
        "Initialize ER/PER-only private position state for a normal trader.",
        "",
        "The trader's deposited L1 collateral becomes private available collateral."
      ],
      "discriminator": [
        35,
        58,
        244,
        21,
        208,
        92,
        150,
        226
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Public market shell."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Trader public position shell.",
            "",
            "This is a delegated sponsor shell. We deserialize and validate it",
            "manually to avoid Anchor write-back on exit."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "marketState",
          "docs": [
            "Existing ER/PER-only market state.",
            "",
            "Loaded and validated manually."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "privatePosition",
          "docs": [
            "ER/PER-only trader private position state.",
            "",
            "Created and serialized manually."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "docs": [
        "Open a public position shell for a trader.",
        "",
        "The actual live position will later be initialized inside MagicBlock / PER."
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader opening a position."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ]
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "placePrivatePrediction",
      "docs": [
        "Place a private prediction inside MagicBlock / PER.",
        "",
        "Traders allocate idle collateral to either the YES or NO side.",
        "No public YES/NO SPL tokens are minted during this operation."
      ],
      "discriminator": [
        143,
        194,
        220,
        215,
        228,
        33,
        35,
        180
      ],
      "accounts": [
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "marketState",
          "docs": [
            "Loaded/stored manually by handler."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "privatePosition",
          "docs": [
            "Loaded/stored manually by handler."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "predictYes",
          "type": "bool"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "resolvePrivateMarketEr",
      "docs": [
        "Resolve private market inside MagicBlock / PER.",
        "",
        "Permission:",
        "- configured oracle only"
      ],
      "discriminator": [
        122,
        22,
        67,
        115,
        108,
        26,
        47,
        109
      ],
      "accounts": [
        {
          "name": "oracle",
          "docs": [
            "Oracle / resolver."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Public market shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "marketState",
          "docs": [
            "ER/PER-only market state.",
            "",
            "Loaded/stored manually."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "yesWins",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setProtocolPaused",
      "docs": [
        "Pause or unpause protocol-level actions."
      ],
      "discriminator": [
        47,
        62,
        75,
        69,
        166,
        0,
        147,
        157
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Protocol admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settlePrivatePositionEr",
      "docs": [
        "Settle a private position after market resolution.",
        "",
        "This calculates:",
        "claimable_amount = idle_collateral + proportional_winning_payout",
        "",
        "Then writes claimable_amount into the public TraderPosition shell."
      ],
      "discriminator": [
        233,
        232,
        228,
        14,
        19,
        49,
        139,
        180
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader or authorized keeper settling this position.",
            "",
            "For now, trader must sign.",
            "Later you can allow keeper/admin/oracle to settle many positions."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Public market shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Public position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "marketState",
          "docs": [
            "ER/PER-only market state.",
            "",
            "Loaded manually."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "privatePosition",
          "docs": [
            "ER/PER-only trader private position state.",
            "",
            "Loaded/stored manually."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  105,
                  118,
                  97,
                  116,
                  101,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [],
      "returns": "u64"
    },
    {
      "name": "updateOracle",
      "docs": [
        "Update oracle / resolver authority."
      ],
      "discriminator": [
        112,
        41,
        209,
        18,
        248,
        226,
        252,
        188
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Protocol admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newOracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateTeeValidator",
      "docs": [
        "Update MagicBlock / PER validator identity."
      ],
      "discriminator": [
        214,
        69,
        130,
        111,
        37,
        122,
        0,
        172
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Protocol admin."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newTeeValidator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdrawCollateral",
      "docs": [
        "Withdraw idle L1 collateral before PER activation.",
        "",
        "Once the position is delegated/activated in PER, withdrawals should go",
        "through private settlement logic instead."
      ],
      "discriminator": [
        115,
        135,
        168,
        106,
        139,
        214,
        138,
        150
      ],
      "accounts": [
        {
          "name": "trader",
          "docs": [
            "Trader withdrawing idle collateral."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Global config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market shell."
          ],
          "writable": true
        },
        {
          "name": "position",
          "docs": [
            "Trader position shell."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Protocol collateral mint."
          ]
        },
        {
          "name": "traderCollateral",
          "docs": [
            "Trader collateral token account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "docs": [
            "Market vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "docs": [
            "Token program."
          ]
        },
        {
          "name": "associatedTokenProgram",
          "docs": [
            "Associated token program."
          ],
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program."
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "traderPosition",
      "discriminator": [
        190,
        176,
        116,
        92,
        24,
        60,
        209,
        198
      ]
    }
  ],
  "events": [
    {
      "name": "collateralDeposited",
      "discriminator": [
        244,
        62,
        77,
        11,
        135,
        112,
        61,
        96
      ]
    },
    {
      "name": "collateralWithdrawn",
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ]
    },
    {
      "name": "marketCommittedAndUndelegated",
      "discriminator": [
        182,
        180,
        96,
        89,
        164,
        188,
        88,
        73
      ]
    },
    {
      "name": "marketDelegated",
      "discriminator": [
        222,
        133,
        6,
        58,
        71,
        21,
        95,
        219
      ]
    },
    {
      "name": "oracleUpdated",
      "discriminator": [
        138,
        9,
        51,
        219,
        228,
        198,
        11,
        147
      ]
    },
    {
      "name": "positionCommittedAndUndelegated",
      "discriminator": [
        3,
        6,
        156,
        113,
        151,
        125,
        253,
        205
      ]
    },
    {
      "name": "positionDelegated",
      "discriminator": [
        72,
        163,
        105,
        189,
        92,
        120,
        40,
        233
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    },
    {
      "name": "privateMarketCreated",
      "discriminator": [
        249,
        72,
        132,
        255,
        210,
        192,
        239,
        85
      ]
    },
    {
      "name": "privateMarketResolvedEr",
      "discriminator": [
        130,
        216,
        180,
        135,
        87,
        78,
        41,
        181
      ]
    },
    {
      "name": "privateMarketStateInitialized",
      "discriminator": [
        90,
        218,
        131,
        7,
        252,
        95,
        132,
        131
      ]
    },
    {
      "name": "privatePositionSettledEr",
      "discriminator": [
        238,
        253,
        54,
        72,
        107,
        99,
        101,
        124
      ]
    },
    {
      "name": "privatePositionStateInitialized",
      "discriminator": [
        198,
        154,
        0,
        190,
        118,
        135,
        104,
        67
      ]
    },
    {
      "name": "privatePredictionPlaced",
      "discriminator": [
        225,
        119,
        69,
        82,
        47,
        85,
        145,
        42
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "protocolPauseUpdated",
      "discriminator": [
        18,
        112,
        97,
        19,
        182,
        70,
        162,
        226
      ]
    },
    {
      "name": "settledPositionClaimed",
      "discriminator": [
        246,
        20,
        106,
        54,
        74,
        195,
        129,
        140
      ]
    },
    {
      "name": "teeValidatorUpdated",
      "discriminator": [
        238,
        109,
        84,
        153,
        123,
        239,
        207,
        202
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "privateMarketNotActive",
      "msg": "Private market is not active"
    },
    {
      "code": 6001,
      "name": "privateMarketNotEnded",
      "msg": "Private market has not ended yet"
    },
    {
      "code": 6002,
      "name": "privateMarketNotResolved",
      "msg": "Private market is not resolved"
    },
    {
      "code": 6003,
      "name": "privateMarketCancelled",
      "msg": "Private market has been cancelled"
    },
    {
      "code": 6004,
      "name": "privateMarketStateNotInitialized",
      "msg": "Private market state is not initialized"
    },
    {
      "code": 6005,
      "name": "privatePositionStateNotInitialized",
      "msg": "Private position state is not initialized"
    },
    {
      "code": 6006,
      "name": "privatePositionTraderMismatch",
      "msg": "Private position belongs to a different trader"
    },
    {
      "code": 6007,
      "name": "privatePositionMarketMismatch",
      "msg": "Private position belongs to a different market"
    },
    {
      "code": 6008,
      "name": "privatePositionAlreadyClaimed",
      "msg": "Private position already claimed"
    },
    {
      "code": 6009,
      "name": "invalidPrivateMarketStatus",
      "msg": "Invalid private market status"
    },
    {
      "code": 6010,
      "name": "invalidPrivateOutcome",
      "msg": "Invalid private market outcome"
    },
    {
      "code": 6011,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6012,
      "name": "insufficientPrivateCollateral",
      "msg": "Insufficient private collateral"
    },
    {
      "code": 6013,
      "name": "insufficientPrivateShares",
      "msg": "Insufficient private shares"
    },
    {
      "code": 6014,
      "name": "winningSupplyIsZero",
      "msg": "Winning supply is zero"
    },
    {
      "code": 6015,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "collateralDeposited",
      "docs": [
        "Event emitted when collateral is deposited into a market vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "collateralWithdrawn",
      "docs": [
        "Event emitted when idle L1 collateral is withdrawn before PER activation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global protocol configuration.",
        "",
        "This is a singleton PDA that controls protocol-wide settings:",
        "- admin authority",
        "- oracle / resolver authority",
        "- collateral mint",
        "- protocol fee",
        "- minimum market liquidity",
        "- MagicBlock / PER validator identity",
        "",
        "PDA:",
        "seeds = [\"config\"]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Protocol admin.",
              "",
              "Admin can pause/unpause the protocol and update high-level settings",
              "in future versions."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "docs": [
              "Oracle / resolver authority.",
              "",
              "This account is allowed to resolve markets after the market end time.",
              "In production, this should ideally become:",
              "- multisig",
              "- optimistic oracle",
              "- dispute-based oracle",
              "- AI oracle with verification layer"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "docs": [
              "Collateral token mint.",
              "",
              "Example:",
              "- USDC mint",
              "- test USDC mint",
              "- any SPL Token / Token-2022 compatible collateral mint"
            ],
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "docs": [
              "Protocol fee in basis points.",
              "",
              "100 bps = 1%",
              "10_000 bps = 100%"
            ],
            "type": "u16"
          },
          {
            "name": "minLiquidity",
            "docs": [
              "Minimum collateral required to create a market."
            ],
            "type": "u64"
          },
          {
            "name": "marketCount",
            "docs": [
              "Number of markets created.",
              "",
              "Used to derive deterministic market PDA:",
              "seeds = [\"market\", market_id.to_le_bytes()]"
            ],
            "type": "u64"
          },
          {
            "name": "paused",
            "docs": [
              "Emergency pause flag.",
              "",
              "If true, market creation, deposits, and trading should stop."
            ],
            "type": "bool"
          },
          {
            "name": "teeValidator",
            "docs": [
              "MagicBlock / Private Ephemeral Rollup validator identity.",
              "",
              "This is the validator / TEE identity used for delegation.",
              "On devnet, this can be the MagicBlock devnet validator identity."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "Public market shell.",
        "",
        "Important:",
        "This account is NOT the live trading state.",
        "",
        "For the MagicBlock / PER-first architecture:",
        "",
        "Solana L1 stores:",
        "- market identity",
        "- creator",
        "- question",
        "- end time",
        "- collateral mint",
        "- vault address",
        "- public lifecycle status",
        "- final outcome",
        "- final settlement aggregates",
        "",
        "MagicBlock / PER stores:",
        "- live reserves",
        "- live YES/NO virtual shares",
        "- private trader positions",
        "- active trading state",
        "",
        "PDA:",
        "seeds = [\"market\", market_id.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "docs": [
              "Incrementing market id."
            ],
            "type": "u64"
          },
          {
            "name": "creator",
            "docs": [
              "Permissionless market creator."
            ],
            "type": "pubkey"
          },
          {
            "name": "question",
            "docs": [
              "Prediction question.",
              "",
              "Example:",
              "\"Will BTC close above $100k on 2026-12-31?\""
            ],
            "type": "string"
          },
          {
            "name": "endTime",
            "docs": [
              "Unix timestamp when trading ends."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp when market was created."
            ],
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "docs": [
              "Collateral mint used by this market."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Collateral vault token account.",
              "",
              "The vault should be an ATA:",
              "mint = collateral_mint",
              "authority = market PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Total collateral deposited into this market's vault.",
              "",
              "This is public aggregate accounting only.",
              "Individual private positions live in MagicBlock / PER state."
            ],
            "type": "u64"
          },
          {
            "name": "finalReserves",
            "docs": [
              "Final reserves after ER/PER resolution.",
              "",
              "This is filled/updated when the private state is settled/committed."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimableSettled",
            "docs": [
              "Sum of all settled claimable amounts."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "docs": [
              "Sum of collateral already claimed by users."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Public lifecycle status."
            ],
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "docs": [
              "Winning outcome.",
              "",
              "Only meaningful after the market is resolved."
            ],
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketCommittedAndUndelegated",
      "docs": [
        "Event emitted when a market shell is committed and undelegated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketDelegated",
      "docs": [
        "Event emitted when a market shell is delegated into MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "teeValidator",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "docs": [
        "Public lifecycle status of the market shell."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "ended"
          },
          {
            "name": "resolved"
          },
          {
            "name": "settlementOpen"
          },
          {
            "name": "closed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "oracleUpdated",
      "docs": [
        "Event emitted when oracle authority changes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oldOracle",
            "type": "pubkey"
          },
          {
            "name": "newOracle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "docs": [
        "Binary prediction outcome."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "undetermined"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          },
          {
            "name": "invalid"
          }
        ]
      }
    },
    {
      "name": "positionCommittedAndUndelegated",
      "docs": [
        "Event emitted when a position shell is committed and undelegated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "claimableAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionDelegated",
      "docs": [
        "Event emitted when a position shell is delegated into MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "teeValidator",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "docs": [
        "Event emitted when a trader opens a position shell."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privateMarketCreated",
      "docs": [
        "Event emitted when a new private prediction market is created.",
        "",
        "Important:",
        "This does NOT mint public YES/NO SPL tokens.",
        "It only creates the public market shell and locks collateral into the vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creatorPosition",
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "endTime",
            "type": "u64"
          },
          {
            "name": "initialLiquidity",
            "type": "u64"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privateMarketResolvedEr",
      "docs": [
        "Event emitted when a private market is resolved inside MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "finalReserves",
            "type": "u64"
          },
          {
            "name": "finalYesSupply",
            "type": "u64"
          },
          {
            "name": "finalNoSupply",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privateMarketStateInitialized",
      "docs": [
        "Event emitted when private market state is initialized inside MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "privateMarketState",
            "type": "pubkey"
          },
          {
            "name": "creatorPrivatePosition",
            "type": "pubkey"
          },
          {
            "name": "reserves",
            "type": "u64"
          },
          {
            "name": "yesSupply",
            "type": "u64"
          },
          {
            "name": "noSupply",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privatePositionSettledEr",
      "docs": [
        "Event emitted when a private position is settled inside MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "claimableAmount",
            "type": "u64"
          },
          {
            "name": "idleCollateral",
            "type": "u64"
          },
          {
            "name": "winningShares",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privatePositionStateInitialized",
      "docs": [
        "Event emitted when private trader position state is initialized inside MagicBlock / PER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "privatePosition",
            "type": "pubkey"
          },
          {
            "name": "collateralAvailable",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "privatePredictionPlaced",
      "docs": [
        "Event emitted when a private prediction is placed.",
        "",
        "Important:",
        "This event intentionally does NOT reveal:",
        "- YES/NO side",
        "- amount",
        "- live YES supply",
        "- live NO supply",
        "",
        "The actual position remains inside MagicBlock / PER private state."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "protocolInitialized",
      "docs": [
        "Event emitted when the protocol is initialized."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "minLiquidity",
            "type": "u64"
          },
          {
            "name": "teeValidator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "protocolPauseUpdated",
      "docs": [
        "Event emitted when protocol pause status changes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "settledPositionClaimed",
      "docs": [
        "Event emitted when a settled private position is claimed from L1 vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "teeValidatorUpdated",
      "docs": [
        "Event emitted when MagicBlock / PER validator identity changes."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oldTeeValidator",
            "type": "pubkey"
          },
          {
            "name": "newTeeValidator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "traderPosition",
      "docs": [
        "Public position shell.",
        "",
        "Important:",
        "This is NOT the live private trading position.",
        "",
        "For MagicBlock / PER-first architecture:",
        "",
        "Solana L1 Position stores:",
        "- market",
        "- trader",
        "- total collateral deposited",
        "- collateral withdrawn before delegation",
        "- whether the position has been delegated",
        "- final claimable payout after settlement",
        "- claimed status",
        "",
        "MagicBlock / PER PrivatePositionState stores:",
        "- live idle collateral",
        "- live YES virtual shares",
        "- live NO virtual shares",
        "- private trading status",
        "",
        "PDA:",
        "seeds = [\"position\", market.key(), trader.key()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this position belongs to."
            ],
            "type": "pubkey"
          },
          {
            "name": "trader",
            "docs": [
              "Trader / owner of this position."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralDeposited",
            "docs": [
              "Total collateral deposited into this market by this trader.",
              "",
              "This is public aggregate information.",
              "It does not reveal YES/NO direction."
            ],
            "type": "u64"
          },
          {
            "name": "collateralWithdrawn",
            "docs": [
              "Collateral withdrawn before the private ER state becomes active.",
              "",
              "Once delegated / initialized in PER, live available collateral should",
              "be tracked in PrivatePositionState, not here."
            ],
            "type": "u64"
          },
          {
            "name": "claimableAmount",
            "docs": [
              "Final claimable payout after ER/PER settlement.",
              "",
              "This gets written after:",
              "resolvePrivateMarketEr",
              "→ settle_private_position_er",
              "→ commit/settlement sync"
            ],
            "type": "u64"
          },
          {
            "name": "claimedAmount",
            "docs": [
              "Amount already claimed from the market vault."
            ],
            "type": "u64"
          },
          {
            "name": "delegated",
            "docs": [
              "Whether this position shell has been delegated / activated for PER use."
            ],
            "type": "bool"
          },
          {
            "name": "settled",
            "docs": [
              "Whether final payout has been settled for this position."
            ],
            "type": "bool"
          },
          {
            "name": "claimed",
            "docs": [
              "Whether the user has fully claimed the settled payout."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
