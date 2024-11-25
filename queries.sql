CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT
);

CREATE TABLE word_classes (
    id SERIAL PRIMARY KEY,
    name TEXT
);

CREATE TABLE words (
    id SERIAL PRIMARY KEY,
    hanzi TEXT NOT NULL,
    pinyin TEXT NOT NULL,
    translation TEXT NOT NULL,
    created_id INT NOT NULL,
    last_modified_id INT NOT NULL,
    word_class_id INT,
    comment TEXT,
    CONSTRAINT fk_created FOREIGN KEY (created_id) REFERENCES users(id),
    CONSTRAINT fk_last_modified FOREIGN KEY (last_modified_id) REFERENCES users(id),
    CONSTRAINT fk_word_class FOREIGN KEY (word_class_id) REFERENCES word_classes(id)
);

CREATE TABLE sets (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    comment TEXT
);

CREATE TABLE words_sets (
    word_id INT,
    set_id INT,
    PRIMARY KEY (word_id, set_id),
    CONSTRAINT fk_word FOREIGN KEY (word_id) REFERENCES words(id),
    CONSTRAINT fk_set FOREIGN KEY (set_id) REFERENCES sets(id)
);
