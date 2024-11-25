import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

// FUNCTION TO PROTECT ENDPOINTS BY ENSURING THAT USER IS LOGGED IN
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/"); // Redirect unauthenticated users to the login page
}

// HELPER FUNCTIONS FOR DATABASE QUERIES

async function getWordClasses() {
  try {
    const { rows } = await db.query("SELECT * FROM users");
    return rows.length ? rows : console.log("No word classes found");
  } catch (err) {
    console.error("Error in getWordClasses:", err);
  }
}

async function getWords() {
  try {
    const { rows } = await db.query("SELECT * FROM words");
    return rows.length ? rows : console.log("No words found");
  } catch (err) {
    console.error("Error in getWords:", err);
  }
}

async function getWord(wordId) {
  try {
    const { rows } = await db.query("SELECT * FROM words WHERE id = $1", [
      wordId,
    ]);
    return rows.length ? rows[0] : console.log("Word not found");
  } catch (err) {
    console.error("Error in getWord:", err);
  }
}

async function getSets() {
  try {
    const { rows } = await db.query("SELECT * FROM sets");
    console.log(rows);
    return rows.length ? rows : console.log("No sets found");
  } catch (err) {
    console.error("Error in getSets:", err);
  }
}

async function getSet(setId) {
  try {
    const { rows } = await db.query("SELECT * FROM sets WHERE id = $1", [
      setId,
    ]);
    return rows.length ? rows[0] : console.log("Set not found");
  } catch (err) {
    console.error("Error in getSet:", err);
  }
}

async function getWordsInSet(setId) {
  try {
    const { rows } = await db.query(
      `
      SELECT 
        w.id AS word_id,
        w.hanzi,
        w.pinyin,
        w.translation,
        w.comment
      FROM 
        words AS w
      JOIN 
        words_sets AS ws ON w.id = ws.word_id
      JOIN 
        sets AS s ON ws.set_id = s.id
      WHERE 
        s.id = $1;
      `,
      [setId] // Use parameterized query to avoid SQL injection
    );
    return rows.length ? rows : console.log("No words found in the set");
  } catch (err) {
    console.error("Error in getWordsInSet:", err);
  }
}

async function addWord(
  hanzi,
  pinyin,
  translation,
  created_id,
  last_modified_id,
  word_class_id,
  comment
) {
  try {
    const result = await db.query(
      `INSERT INTO words (hanzi, pinyin, translation, created_id, last_modified_id, word_class_id, comment)
    VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [
        hanzi,
        pinyin,
        translation,
        created_id,
        last_modified_id,
        word_class_id,
        comment,
      ]
    );
  } catch (err) {
    console.error(`Error in addWord: ${err.message}`);
  }
}
async function addSet(name, comment) {
  try {
    await db.query(
      `INSERT INTO sets (name, comment)
      VALUES($1, $2)`,
      [name, comment]
    );
  } catch (err) {
    console.error(`Error in addSet: ${err.message}`);
  }
}

async function addWordToSet(wordId, setId) {
  try {
    await db.query(
      `INSERT INTO words_sets (word_id, set_id)
      VALUES($1, $2)`,
      [wordId, setId]
    );
  } catch (err) {
    console.error(`Error in addWordToSet: ${err.message}`);
  }
}

async function deleteWordFromSet(wordId) {
  try {
    await db.query(
      `DELETE FROM words_sets WHERE word_id = $1
`,
      [wordId]
    );
  } catch (err) {
    console.error(`Error in deleteWordFromSet: ${err.message}`);
  }
}

async function getSetIds(wordId) {
  try {
    const { rows } = await db.query(
      `SELECT set_id FROM words_sets WHERE word_id = $1`,
      [wordId]
    );

    return rows.length ? rows : [];
  } catch (err) {
    console.error(`Error in getSetIds: ${err.message}`);
  }
}

async function deleteWordFromDB(wordId) {
  try {
    const setIds = await getSetIds(wordId);
    if (setIds.length > 0) {
      for (let { set_id } of setIds) await deleteWordFromSet(wordId, set_id);
    }
    await db.query(`DELETE FROM words WHERE id = $1`, [wordId]);
  } catch (err) {
    console.error(`Error in deleteWordFromDB: ${err.message}`);
  }
}

// ENDPOINTS: GET routes

app.get("/", (req, res) => {
  res.render("start.ejs");
});

app.get("/home", ensureAuthenticated, (req, res) => {
  res.render("home.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/add-word", ensureAuthenticated, (req, res) => {
  res.render("modify-word.ejs", { title: "Add New Word" });
});

app.post("/add-word", ensureAuthenticated, async (req, res) => {
  const { hanzi, pinyin, translation, wordClassId, comment } = req.body;
  const userId = req.user.id; // Get the currently logged-in user's ID

  try {
    await addWord(
      hanzi,
      pinyin,
      translation,
      userId,
      userId,
      wordClassId,
      comment
    );
    res.redirect("/words");
  } catch (err) {
    console.error("Error adding word:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/words", ensureAuthenticated, async (req, res) => {
  const words = await getWords();
  res.render("words.ejs", { words: words });
});

app.get("/word/:wordId", ensureAuthenticated, async (req, res) => {
  try {
    const wordId = req.params.wordId;
    const setsInDb = await getSets();
    const word = await getWord(wordId);
    if (!word) {
      return res.status(404).send("Word not found");
    }
    const words = await getWord(wordId);
    res.render("word.ejs", {
      word: word,
      hanzi: word.hanzi,
      setsInDb: setsInDb,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/add-set", ensureAuthenticated, (req, res) => {
  res.render("modify-set.ejs", { title: "Add New Set" });
});

app.get("/sets", ensureAuthenticated, async (req, res) => {
  const setsInDb = await getSets();
  console.log(setsInDb);
  res.render("sets.ejs", { sets: setsInDb });
});

app.get("/set/:setId", ensureAuthenticated, async (req, res) => {
  try {
    const wordsInDb = await getWords();
    const setId = req.params.setId;
    const set = await getSet(setId);
    if (!set) {
      return res.status(404).send("Set not found");
    }
    const words = await getWordsInSet(setId);
    res.render("set.ejs", {
      words: words,
      set: set,
      wordsInDb: wordsInDb,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/add-set", ensureAuthenticated, async (req, res) => {
  const name = req.body.name;
  const comment = req.body.comment;
  try {
    await db.query("INSERT INTO sets (name, comment) VALUES ($1, $2)", [
      name,
      comment,
    ]);
    res.redirect("/sets");
  } catch (err) {
    res.send(err);
  }
});

app.post("/add-word-to-set/:wordId/:setId", async (req, res) => {
  const { wordId, setId } = req.params;

  try {
    await addWordToSet(wordId, setId);

    res.redirect(`/set/${setId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add word to set" });
  }
});

app.post("/delete-word-from-set/:wordId/:setId", async (req, res) => {
  const { wordId, setId } = req.params;

  try {
    await deleteWordFromDB(wordId, setId);

    res.redirect(`/set/${setId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete word from set" });
  }
});

// ENDPOINTS: LOGIN AND REGISTER ROUTES

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/",
  })
);

app.post("/register", async (req, res) => {
  const { username, firstName, lastName, email, password } = req.body;

  try {
    const checkResult = await db.query(
      "SELECT * FROM users WHERE user_name = $1",
      [username]
    );

    if (checkResult.rows.length > 0) {
      return res.redirect("/"); // User already exists
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO users (user_name, first_name, last_name, email, password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [username, firstName, lastName, email, hashedPassword]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) {
        console.error("Error logging in:", err);
        return res.redirect("/");
      }
      res.redirect("/home");
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// PASSPORT AUTHENTICATION

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query(
        "SELECT * FROM users WHERE user_name = $1",
        [username]
      );
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false, { message: "Incorrect password." });
            }
          }
        });
      } else {
        return cb(null, false, { message: "User not found." });
      }
    } catch (err) {
      console.log(err);
      return cb(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user.id); // Save only the user ID
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = result.rows[0];
    cb(null, user); // Attach the user object to req.user
  } catch (err) {
    cb(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
