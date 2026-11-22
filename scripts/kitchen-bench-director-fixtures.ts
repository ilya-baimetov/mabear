// Recorded live director responses, not new API requests. See docs/kitchen-bench/director.
export const directorCases=[
  {
    "id": "carrot-en",
    "text": "Masha picks carrot number 2 from the garden, walks to the bench and puts it on the bench.",
    "lang": "en",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Masha plucks carrot number 2 from the garden and proudly sets it on the bench",
      "time_of_day": null,
      "mood": "playful",
      "music": {
        "mood": "playful",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "masha",
          "verb": "take",
          "target": "carrot_2",
          "item": "carrot_2",
          "line": "Number two, come out!",
          "emote": "giggle",
          "sfx": "pop",
          "emotion": "excited",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "bear",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.8,
          "shot": "auto"
        },
        {
          "actor": "hare",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": "gasp",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 1,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "masha",
          "verb": "put_down",
          "target": "bench",
          "item": "carrot_2",
          "line": "There! A carrot for later!",
          "emote": null,
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "nod",
          "target": null,
          "item": null,
          "line": null,
          "emote": "chuckle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": true,
          "delay_s": 0.6,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "clap",
          "target": null,
          "item": null,
          "line": null,
          "emote": "cheer",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "auto"
        }
      ],
      "rule_hits": []
    }
  },
  {
    "id": "carrot-ru",
    "text": "Маша берёт морковку номер 2 с грядки, идёт к скамейке и кладёт её на скамейку.",
    "lang": "ru",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Маша срывает вторую морковку и бережно кладёт её на скамейку",
      "time_of_day": null,
      "mood": "playful",
      "music": {
        "mood": "playful",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "masha",
          "verb": "run_to",
          "target": "garden",
          "item": null,
          "line": null,
          "emote": "giggle",
          "sfx": null,
          "emotion": "excited",
          "with_previous": false,
          "delay_s": 0,
          "shot": "wide"
        },
        {
          "actor": "masha",
          "verb": "take",
          "target": "carrot_2",
          "item": "carrot_2",
          "line": "Вот она, вторая морковка!",
          "emote": null,
          "sfx": "pop",
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "hare",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": "gasp",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.6,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "bear",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.8,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "put_down",
          "target": "bench",
          "item": "carrot_2",
          "line": null,
          "emote": null,
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "masha",
          "verb": "clap",
          "target": null,
          "item": null,
          "line": null,
          "emote": "cheer",
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "auto"
        },
        {
          "actor": "bear",
          "verb": "nod",
          "target": null,
          "item": null,
          "line": null,
          "emote": "chuckle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": true,
          "delay_s": 0.4,
          "shot": "auto"
        }
      ],
      "rule_hits": []
    }
  },
  {
    "id": "ball-en",
    "text": "Masha takes the ball, walks to the bench, drops it and waits. Then she walks to the clearing, returns and picks up the ball.",
    "lang": "en",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Masha plays with her ball: drops it by the bench, wanders off, then comes back to scoop it up again",
      "time_of_day": null,
      "mood": "playful",
      "music": {
        "mood": "playful",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "masha",
          "verb": "take",
          "target": "ball",
          "item": "ball",
          "line": null,
          "emote": "giggle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "bear",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.5,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "masha",
          "verb": "drop",
          "target": null,
          "item": "ball",
          "line": null,
          "emote": "uh_oh",
          "sfx": "boing",
          "emotion": "mischievous",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "shrug",
          "target": null,
          "item": null,
          "line": null,
          "emote": "grunt",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.6,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "look_at",
          "target": "bear",
          "item": null,
          "line": "I'm waiting... and waiting...",
          "emote": null,
          "sfx": null,
          "emotion": "mischievous",
          "with_previous": false,
          "delay_s": 1.5,
          "shot": "medium"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "clearing",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "wide"
        },
        {
          "actor": "masha",
          "verb": "run_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "wheee",
          "sfx": null,
          "emotion": "excited",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "masha",
          "verb": "take",
          "target": "ball",
          "item": "ball",
          "line": "Got you, ball!",
          "emote": "giggle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "laugh",
          "target": null,
          "item": null,
          "line": null,
          "emote": "chuckle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": true,
          "delay_s": 0.5,
          "shot": "auto"
        }
      ],
      "rule_hits": []
    }
  },
  {
    "id": "ball-ru",
    "text": "Маша берёт мяч, идёт к скамейке, роняет мяч и ждёт. Потом она идёт на поляну, возвращается и поднимает мяч.",
    "lang": "ru",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Маша роняет мяч у скамейки, гуляет по поляне и возвращается за ним",
      "time_of_day": null,
      "mood": "playful",
      "music": {
        "mood": "playful",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "masha",
          "verb": "take",
          "target": "ball",
          "item": "ball",
          "line": null,
          "emote": "giggle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "bear",
          "verb": "look_at",
          "target": "masha",
          "item": null,
          "line": null,
          "emote": null,
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.8,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "drop",
          "target": null,
          "item": "ball",
          "line": null,
          "emote": "uh_oh",
          "sfx": "boing",
          "emotion": "surprised",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "masha",
          "verb": "look_at",
          "target": "bear",
          "item": null,
          "line": "Мишка, подожди, я сейчас!",
          "emote": null,
          "sfx": null,
          "emotion": "mischievous",
          "with_previous": false,
          "delay_s": 1.5,
          "shot": "medium"
        },
        {
          "actor": "bear",
          "verb": "shrug",
          "target": null,
          "item": null,
          "line": null,
          "emote": "grunt",
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.6,
          "shot": "auto"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "clearing",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "wide"
        },
        {
          "actor": "masha",
          "verb": "walk_to",
          "target": "bench",
          "item": null,
          "line": null,
          "emote": "giggle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "tracking"
        },
        {
          "actor": "masha",
          "verb": "take",
          "target": "ball",
          "item": "ball",
          "line": null,
          "emote": "cheer",
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "facepalm",
          "target": null,
          "item": null,
          "line": null,
          "emote": "chuckle",
          "sfx": null,
          "emotion": "happy",
          "with_previous": true,
          "delay_s": 0.5,
          "shot": "auto"
        }
      ],
      "rule_hits": []
    }
  },
  {
    "id": "cupboard-en",
    "text": "Bear opens the kitchen cupboard, takes out the honey jar and closes the cupboard while holding the jar.",
    "lang": "en",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Bear fetches his honey jar from the kitchen cupboard and closes it with a happy hum",
      "time_of_day": null,
      "mood": "calm",
      "music": {
        "mood": "calm",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "bear",
          "verb": "walk_to",
          "target": "house_kitchen",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": "door_creak",
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "wide"
        },
        {
          "actor": "masha",
          "verb": "look_at",
          "target": "bear",
          "item": null,
          "line": null,
          "emote": null,
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.8,
          "shot": "auto"
        },
        {
          "actor": "bear",
          "verb": "open",
          "target": "cupboard",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": "door_creak",
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "bear",
          "verb": "take",
          "target": "pantry_honey",
          "item": "pantry_honey",
          "line": null,
          "emote": "chuckle",
          "sfx": "glass_clink",
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "close",
          "target": "cupboard",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        }
      ],
      "rule_hits": []
    }
  },
  {
    "id": "cupboard-ru",
    "text": "Медведь открывает кухонный шкаф, достаёт банку мёда и закрывает шкаф, держа банку в лапе.",
    "lang": "ru",
    "world": {
      "timeOfDay": "day",
      "actors": {
        "lady_bear": {
          "pos": [
            -3.5,
            0.8
          ],
          "facing": 0.2,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "hare": {
          "pos": [
            4.1,
            -4.6
          ],
          "facing": 0.1,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "rosie": {
          "pos": [
            4,
            -1.1
          ],
          "facing": -0.3,
          "mark": "garden",
          "holding": null,
          "posture": "stand"
        },
        "squirrel": {
          "pos": [
            7.2,
            1.1
          ],
          "facing": -0.5,
          "mark": "swing",
          "holding": null,
          "posture": "stand"
        },
        "rival_bear": {
          "pos": [
            -8.6,
            -0.5
          ],
          "facing": 0.3,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "masha": {
          "pos": [
            0.25,
            0.5
          ],
          "facing": 0,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "bear": {
          "pos": [
            -1.65,
            -0.25
          ],
          "facing": 0.12,
          "mark": "clearing",
          "holding": null,
          "posture": "stand"
        },
        "wolf_a": {
          "pos": [
            12.1,
            0.3
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        },
        "wolf_b": {
          "pos": [
            12,
            -1.9
          ],
          "facing": -1.5707963267948966,
          "mark": "van",
          "holding": null,
          "posture": "stand"
        }
      },
      "props": {
        "jam_jar": {
          "at": "table"
        },
        "honey_pot": {
          "at": "beehive"
        },
        "pancakes": {
          "at": "hidden"
        },
        "frying_pan": {
          "at": "table"
        },
        "ball": {
          "at": "clearing"
        },
        "fishing_rod": {
          "at": "pier"
        },
        "fish": {
          "at": "hidden"
        },
        "lollipop": {
          "at": "hidden"
        },
        "flowers": {
          "at": "garden"
        },
        "carrot": {
          "at": "garden",
          "planted": true
        },
        "broom": {
          "at": "porch"
        },
        "book": {
          "at": "bench"
        },
        "pillow": {
          "at": "hammock"
        },
        "bucket": {
          "at": "pier"
        },
        "watering_can": {
          "at": "garden"
        },
        "flour_bag": {
          "at": "table"
        },
        "cake": {
          "at": "hidden"
        },
        "teapot": {
          "at": "table"
        },
        "pantry_honey": {
          "at": "cupboard"
        },
        "carrot_2": {
          "at": "garden",
          "planted": true
        },
        "carrot_3": {
          "at": "garden",
          "planted": true
        },
        "carrot_4": {
          "at": "garden",
          "planted": true
        },
        "carrot_5": {
          "at": "garden",
          "planted": true
        },
        "carrot_6": {
          "at": "garden",
          "planted": true
        },
        "carrot_7": {
          "at": "garden",
          "planted": true
        },
        "carrot_8": {
          "at": "garden",
          "planted": true
        },
        "carrot_9": {
          "at": "garden",
          "planted": true
        }
      }
    },
    "script": {
      "summary": "Мишка идёт на кухню, достаёт из шкафа банку мёда и довольно урчит",
      "time_of_day": null,
      "mood": "calm",
      "music": {
        "mood": "calm",
        "intensity": "soft",
        "change": "start"
      },
      "ambience": [
        "birds_day"
      ],
      "beats": [
        {
          "actor": "bear",
          "verb": "walk_to",
          "target": "door",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "wide"
        },
        {
          "actor": "masha",
          "verb": "look_at",
          "target": "bear",
          "item": null,
          "line": null,
          "emote": null,
          "sfx": null,
          "emotion": "curious",
          "with_previous": true,
          "delay_s": 0.8,
          "shot": "auto"
        },
        {
          "actor": "bear",
          "verb": "open",
          "target": "door",
          "item": null,
          "line": null,
          "emote": null,
          "sfx": "door_creak",
          "emotion": "neutral",
          "with_previous": false,
          "delay_s": 0,
          "shot": "auto"
        },
        {
          "actor": "bear",
          "verb": "walk_to",
          "target": "house_kitchen",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "auto"
        },
        {
          "actor": "bear",
          "verb": "open",
          "target": "cupboard",
          "item": null,
          "line": null,
          "emote": null,
          "sfx": "door_creak",
          "emotion": "curious",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        },
        {
          "actor": "bear",
          "verb": "take",
          "target": "pantry_honey",
          "item": "pantry_honey",
          "line": null,
          "emote": "chuckle",
          "sfx": "glass_clink",
          "emotion": "happy",
          "with_previous": false,
          "delay_s": 0,
          "shot": "close"
        },
        {
          "actor": "bear",
          "verb": "close",
          "target": "cupboard",
          "item": null,
          "line": null,
          "emote": "hum",
          "sfx": null,
          "emotion": "proud",
          "with_previous": false,
          "delay_s": 0,
          "shot": "medium"
        }
      ],
      "rule_hits": []
    }
  }
];
