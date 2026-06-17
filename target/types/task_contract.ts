/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/task_contract.json`.
 */
export type TaskContract = {
  "address": "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB",
  "metadata": {
    "name": "taskContract",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "adminInitProtocol",
      "discriminator": [
        105,
        248,
        116,
        159,
        70,
        45,
        188,
        80
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  115,
                  116,
                  101,
                  109,
                  95,
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
          "name": "judgeRegistry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "judgeStakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "judgeFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "cancelExpiredTask",
      "discriminator": [
        157,
        17,
        201,
        174,
        7,
        197,
        65,
        191
      ],
      "accounts": [
        {
          "name": "requestor",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "workerEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "task.worker",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "escrowTokenVault",
          "writable": true
        },
        {
          "name": "requestorTokenAccount",
          "writable": true
        },
        {
          "name": "nftAsset",
          "writable": true
        },
        {
          "name": "coreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancelOpenTask",
      "discriminator": [
        235,
        176,
        186,
        97,
        10,
        106,
        63,
        15
      ],
      "accounts": [
        {
          "name": "requestor",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "escrowTokenVault",
          "writable": true
        },
        {
          "name": "requestorTokenAccount",
          "writable": true
        },
        {
          "name": "nftAsset",
          "writable": true
        },
        {
          "name": "coreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimJudgeFee",
      "discriminator": [
        211,
        42,
        179,
        176,
        147,
        5,
        204,
        47
      ],
      "accounts": [
        {
          "name": "judge",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "judgeAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107,
                  95,
                  106,
                  117,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        },
        {
          "name": "escrowTokenVault",
          "writable": true
        },
        {
          "name": "judgeTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initJudgeAssignment",
      "discriminator": [
        170,
        149,
        175,
        204,
        207,
        178,
        193,
        11
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "judge"
        },
        {
          "name": "task",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "judgeAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107,
                  95,
                  106,
                  117,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeTask",
      "discriminator": [
        96,
        206,
        3,
        20,
        245,
        167,
        60,
        125
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  115,
                  116,
                  101,
                  109,
                  95,
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
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "escrowTokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "task"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "nftAsset",
          "writable": true,
          "signer": true
        },
        {
          "name": "coreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        },
        {
          "name": "bountyAmount",
          "type": "u64"
        },
        {
          "name": "workerStakeAmount",
          "type": "u64"
        },
        {
          "name": "requiredJudgesM",
          "type": "u16"
        },
        {
          "name": "approvalThresholdN",
          "type": "u16"
        },
        {
          "name": "deadlines",
          "type": {
            "array": [
              "i64",
              2
            ]
          }
        },
        {
          "name": "publicMetadataUri",
          "type": "string"
        },
        {
          "name": "encryptedTaskDetailUri",
          "type": "string"
        },
        {
          "name": "encryptedSubmissionUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "judgeRegister",
      "discriminator": [
        39,
        183,
        202,
        177,
        225,
        36,
        69,
        33
      ],
      "accounts": [
        {
          "name": "judge",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  115,
                  116,
                  101,
                  109,
                  95,
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
          "name": "judgeRegistry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "judgeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        },
        {
          "name": "judgeStakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stakeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "judgeUnregister",
      "discriminator": [
        8,
        147,
        247,
        224,
        86,
        66,
        106,
        55
      ],
      "accounts": [
        {
          "name": "judge",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  115,
                  116,
                  101,
                  109,
                  95,
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
          "name": "judgeRegistry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "judgeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        },
        {
          "name": "judgeStakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "judgeVote",
      "discriminator": [
        188,
        220,
        58,
        36,
        177,
        17,
        44,
        176
      ],
      "accounts": [
        {
          "name": "judge",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "judgeRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  99,
                  111,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        },
        {
          "name": "judgeAssignment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107,
                  95,
                  106,
                  117,
                  100,
                  103,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "judge"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "isPass",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settlePayment",
      "discriminator": [
        129,
        7,
        163,
        250,
        122,
        226,
        158,
        249
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "requestor",
          "writable": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "workerEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "task.worker",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "escrowTokenVault",
          "writable": true
        },
        {
          "name": "workerTokenAccount",
          "writable": true
        },
        {
          "name": "requestorTokenAccount",
          "writable": true
        },
        {
          "name": "nftAsset",
          "writable": true
        },
        {
          "name": "workerSystemAccount",
          "writable": true
        },
        {
          "name": "coreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "stakeToUnlock",
      "discriminator": [
        164,
        191,
        97,
        217,
        17,
        227,
        199,
        18
      ],
      "accounts": [
        {
          "name": "worker",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "workerEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              },
              {
                "kind": "account",
                "path": "worker"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitAndAssign",
      "discriminator": [
        158,
        174,
        83,
        32,
        114,
        4,
        203,
        41
      ],
      "accounts": [
        {
          "name": "worker",
          "writable": true,
          "signer": true
        },
        {
          "name": "task",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "task.id",
                "account": "task"
              }
            ]
          }
        },
        {
          "name": "systemConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  115,
                  116,
                  101,
                  109,
                  95,
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
          "name": "judgeRegistry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  117,
                  100,
                  103,
                  101,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "encryptedSubmissionUri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "judgeRecord",
      "discriminator": [
        72,
        138,
        30,
        91,
        40,
        248,
        164,
        249
      ]
    },
    {
      "name": "judgeRegistry",
      "discriminator": [
        124,
        54,
        203,
        109,
        188,
        129,
        29,
        209
      ]
    },
    {
      "name": "judgeStakeVault",
      "discriminator": [
        92,
        8,
        221,
        244,
        117,
        1,
        214,
        98
      ]
    },
    {
      "name": "systemConfig",
      "discriminator": [
        218,
        150,
        16,
        126,
        102,
        185,
        75,
        1
      ]
    },
    {
      "name": "task",
      "discriminator": [
        79,
        34,
        229,
        55,
        88,
        90,
        55,
        84
      ]
    },
    {
      "name": "taskJudgeAssignment",
      "discriminator": [
        149,
        122,
        211,
        115,
        164,
        249,
        79,
        144
      ]
    },
    {
      "name": "workerEscrow",
      "discriminator": [
        67,
        33,
        132,
        93,
        117,
        5,
        228,
        144
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidStatus",
      "msg": "Invalid Task Status for this operation."
    },
    {
      "code": 6001,
      "name": "invalidStakeAmount",
      "msg": "Worker stake amount does not match the requirement."
    },
    {
      "code": 6002,
      "name": "deadlinePassed",
      "msg": "Deadline has passed."
    },
    {
      "code": 6003,
      "name": "unauthorizedWorker",
      "msg": "Not the assigned worker or unauthorized action."
    },
    {
      "code": 6004,
      "name": "alreadyVoted",
      "msg": "Judge has already voted."
    },
    {
      "code": 6005,
      "name": "votingNotComplete",
      "msg": "Voting is still active or threshold not reached."
    },
    {
      "code": 6006,
      "name": "settlementNotDecisive",
      "msg": "Settlement outcome is not decisive."
    },
    {
      "code": 6007,
      "name": "notAssignedJudge",
      "msg": "Not an assigned judge for this task."
    },
    {
      "code": 6008,
      "name": "notEnoughJudges",
      "msg": "Not enough active judges in the pool."
    },
    {
      "code": 6009,
      "name": "alreadyClaimed",
      "msg": "Judge has already claimed the fee."
    },
    {
      "code": 6010,
      "name": "notEligibleForFee",
      "msg": "Judge is not eligible to claim fee for this task."
    },
    {
      "code": 6011,
      "name": "duplicateJudge",
      "msg": "Duplicate judge assignment is not allowed."
    },
    {
      "code": 6012,
      "name": "invalidConfiguration",
      "msg": "Invalid configuration parameters."
    },
    {
      "code": 6013,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account for this task."
    },
    {
      "code": 6014,
      "name": "taskNotExpired",
      "msg": "Task has not expired yet."
    },
    {
      "code": 6015,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized admin."
    },
    {
      "code": 6016,
      "name": "stakeLocked",
      "msg": "Judge stake is currently locked in an active task."
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow."
    },
    {
      "code": 6018,
      "name": "judgeRegistryFull",
      "msg": "Judge registry is full."
    },
    {
      "code": 6019,
      "name": "invalidJudgePool",
      "msg": "Invalid canonical judge pool."
    },
    {
      "code": 6020,
      "name": "unsupportedRandomness",
      "msg": "Unsupported randomness mode."
    },
    {
      "code": 6021,
      "name": "assignmentSetIncomplete",
      "msg": "Settlement assignment set is incomplete or invalid."
    },
    {
      "code": 6022,
      "name": "invalidEscrowBalance",
      "msg": "Escrow vault balance does not match the task invariant."
    }
  ],
  "types": [
    {
      "name": "judgeRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "judge",
            "type": "pubkey"
          },
          {
            "name": "amountStaked",
            "type": "u64"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "totalAssignmentCount",
            "type": "u16"
          },
          {
            "name": "lockedUntil",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "judgeRegistry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "judges",
            "type": {
              "array": [
                "pubkey",
                16
              ]
            }
          },
          {
            "name": "activeCount",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "judgeStakeVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "randomnessMode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "blockhashMvp"
          },
          {
            "name": "switchboardVrf"
          },
          {
            "name": "commitReveal"
          }
        ]
      }
    },
    {
      "name": "systemConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "judgeFeeBps",
            "type": "u16"
          },
          {
            "name": "maxJudgesPerTask",
            "type": "u16"
          },
          {
            "name": "totalActiveJudges",
            "type": "u32"
          },
          {
            "name": "randomnessMode",
            "type": {
              "defined": {
                "name": "randomnessMode"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "task",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "requestor",
            "type": "pubkey"
          },
          {
            "name": "worker",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "escrowTokenVault",
            "type": "pubkey"
          },
          {
            "name": "nftAsset",
            "type": "pubkey"
          },
          {
            "name": "bountyAmount",
            "type": "u64"
          },
          {
            "name": "judgeFeeBps",
            "type": "u16"
          },
          {
            "name": "workerStakeAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "submissionDeadline",
            "type": "i64"
          },
          {
            "name": "votingDeadline",
            "type": "i64"
          },
          {
            "name": "publicMetadataUri",
            "type": "string"
          },
          {
            "name": "encryptedTaskDetailUri",
            "type": "string"
          },
          {
            "name": "encryptedSubmissionUri",
            "type": "string"
          },
          {
            "name": "requiredJudgesM",
            "type": "u16"
          },
          {
            "name": "approvalThresholdN",
            "type": "u16"
          },
          {
            "name": "passVoteCount",
            "type": "u16"
          },
          {
            "name": "failVoteCount",
            "type": "u16"
          },
          {
            "name": "assignedJudgeCount",
            "type": "u16"
          },
          {
            "name": "settledJudgeWinnerCount",
            "type": "u16"
          },
          {
            "name": "assignedJudges",
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "feePerJudge",
            "type": "u64"
          },
          {
            "name": "totalJudgeFeeReserved",
            "type": "u64"
          },
          {
            "name": "judgeFeeClaimed",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "taskStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "taskJudgeAssignment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "taskId",
            "type": "u64"
          },
          {
            "name": "task",
            "type": "pubkey"
          },
          {
            "name": "judge",
            "type": "pubkey"
          },
          {
            "name": "assignedOrder",
            "type": "u16"
          },
          {
            "name": "assignedAt",
            "type": "i64"
          },
          {
            "name": "hasVoted",
            "type": "bool"
          },
          {
            "name": "voteIsPass",
            "type": "bool"
          },
          {
            "name": "votedAt",
            "type": "i64"
          },
          {
            "name": "hasClaimedFee",
            "type": "bool"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "taskStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "inProgress"
          },
          {
            "name": "resolving"
          },
          {
            "name": "completed"
          },
          {
            "name": "failed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "inconclusive"
          }
        ]
      }
    },
    {
      "name": "workerEscrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "worker",
            "type": "pubkey"
          },
          {
            "name": "task",
            "type": "pubkey"
          },
          {
            "name": "taskId",
            "type": "u64"
          },
          {
            "name": "amountStaked",
            "type": "u64"
          },
          {
            "name": "isSlashed",
            "type": "bool"
          },
          {
            "name": "isReleased",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
